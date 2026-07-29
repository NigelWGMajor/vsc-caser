import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const brokenImageMarker = '⛓️‍💥';

export interface NestImagesOptions {
    searchRoot?: string;
}

export interface NestImagesResult {
    markdownPath: string;
    references: number;
    moved: number;
    repaired: number;
    broken: number;
    unchanged: number;
}

interface ImageOccurrence {
    altStart: number;
    altEnd: number;
    destinationStart: number;
    destinationEnd: number;
    destination: string;
}

interface Replacement {
    start: number;
    end: number;
    text: string;
}

interface MoveOperation {
    source: string;
    destination: string;
}

interface ResolvedDestination {
    filePath: string;
    wasDirect: boolean;
}

const ignoredSearchDirectories = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules'
]);

export async function nestImagesInMarkdown(
    markdownPath: string,
    options: NestImagesOptions = {}
): Promise<NestImagesResult> {
    const absoluteMarkdownPath = path.resolve(markdownPath);
    const markdownDirectory = path.dirname(absoluteMarkdownPath);
    const searchRoot = path.resolve(options.searchRoot ?? markdownDirectory);
    const content = await fs.readFile(absoluteMarkdownPath, 'utf8');
    const occurrences = findMarkdownImageOccurrences(content);
    const result: NestImagesResult = {
        markdownPath: absoluteMarkdownPath,
        references: occurrences.length,
        moved: 0,
        repaired: 0,
        broken: 0,
        unchanged: 0
    };

    if (occurrences.length === 0) {
        return result;
    }

    const replacements: Replacement[] = [];
    const moves: MoveOperation[] = [];
    const plannedMoveDestinations = new Map<string, string>();
    const destinationResults = new Map<string, { destination?: string; broken: boolean; moved: boolean; repaired: boolean }>();
    const reservedDestinations = new Set<string>();
    let imageDirectories: string[] | undefined;

    for (const occurrence of occurrences) {
        const destinationKey = occurrence.destination;
        let destinationResult = destinationResults.get(destinationKey);

        if (!destinationResult) {
            const parsedDestination = parseLocalDestination(occurrence.destination);
            if (!occurrence.destination.trim()) {
                destinationResult = { broken: true, moved: false, repaired: false };
            } else if (!parsedDestination) {
                destinationResult = { broken: false, moved: false, repaired: false };
            } else {
                let resolved = await resolveDirect(markdownDirectory, parsedDestination.filePath);
                if (!resolved) {
                    imageDirectories ??= await findImageDirectories(searchRoot);
                    resolved = await searchForImage(
                        markdownDirectory,
                        searchRoot,
                        parsedDestination.filePath,
                        imageDirectories
                    );
                }

                if (!resolved) {
                    destinationResult = { broken: true, moved: false, repaired: false };
                } else {
                    let finalPath = resolved.filePath;
                    let moved = false;

                    const resolvedReferenceContainsImage = resolved.wasDirect
                        ? hasImagePathSegment(parsedDestination.filePath)
                        : hasImagePathSegment(path.relative(markdownDirectory, finalPath));
                    if (!resolvedReferenceContainsImage) {
                        const sourceKey = normalizeForComparison(resolved.filePath);
                        const plannedDestination = plannedMoveDestinations.get(sourceKey);
                        if (plannedDestination) {
                            finalPath = plannedDestination;
                        } else {
                            const requestedDestination = path.join(
                                markdownDirectory,
                                'image',
                                path.basename(finalPath)
                            );
                            finalPath = await reserveAvailableDestination(
                                requestedDestination,
                                finalPath,
                                reservedDestinations
                            );
                            plannedMoveDestinations.set(sourceKey, finalPath);
                            moves.push({ source: resolved.filePath, destination: finalPath });
                        }
                        moved = true;
                    }

                    const updatedReference = formatMarkdownDestination(
                        path.relative(markdownDirectory, finalPath),
                        parsedDestination.suffix
                    );
                    const repaired = !resolved.wasDirect || updatedReference !== occurrence.destination;
                    destinationResult = {
                        destination: updatedReference,
                        broken: false,
                        moved,
                        repaired
                    };
                }
            }
            destinationResults.set(destinationKey, destinationResult);
        }

        const altText = content.slice(occurrence.altStart, occurrence.altEnd);
        if (destinationResult.broken) {
            result.broken++;
            const markedAlt = addBrokenMarker(altText);
            if (markedAlt !== altText) {
                replacements.push({
                    start: occurrence.altStart,
                    end: occurrence.altEnd,
                    text: markedAlt
                });
            }
            continue;
        }

        const cleanedAlt = removeBrokenMarker(altText);
        if (cleanedAlt !== altText) {
            replacements.push({
                start: occurrence.altStart,
                end: occurrence.altEnd,
                text: cleanedAlt
            });
        }

        if (destinationResult.destination
            && destinationResult.destination !== occurrence.destination) {
            replacements.push({
                start: occurrence.destinationStart,
                end: occurrence.destinationEnd,
                text: destinationResult.destination
            });
        }

        if (destinationResult.moved) {
            // Moved files are counted once after duplicate move operations are removed.
        } else if (destinationResult.repaired) {
            result.repaired++;
        } else {
            result.unchanged++;
        }
    }

    const uniqueMoves = deduplicateMoves(moves);
    result.moved = uniqueMoves.length;
    const updatedContent = applyReplacements(content, deduplicateReplacements(replacements));
    const completedMoves: MoveOperation[] = [];
    try {
        for (const move of uniqueMoves) {
            await moveFile(move.source, move.destination);
            completedMoves.push(move);
        }
        if (updatedContent !== content) {
            await fs.writeFile(absoluteMarkdownPath, updatedContent, 'utf8');
        }
    } catch (error) {
        for (const move of completedMoves.reverse()) {
            try {
                await moveFile(move.destination, move.source);
            } catch {
                // Keep the original error; a rollback failure should not conceal it.
            }
        }
        throw error;
    }

    return result;
}

function findMarkdownImageOccurrences(content: string): ImageOccurrence[] {
    const occurrences: ImageOccurrence[] = [];
    const definitionDestinations = findReferenceDefinitions(content);

    for (let index = 0; index < content.length - 2; index++) {
        if (content[index] !== '!' || content[index + 1] !== '[' || isEscaped(content, index)) {
            continue;
        }

        const altEnd = findUnescapedCharacter(content, index + 2, ']');
        if (altEnd === -1) {
            continue;
        }

        let cursor = altEnd + 1;
        while (cursor < content.length && (content[cursor] === ' ' || content[cursor] === '\t')) {
            cursor++;
        }

        if (content[cursor] === '(') {
            const destination = parseInlineDestination(content, cursor + 1);
            if (destination) {
                occurrences.push({
                    altStart: index + 2,
                    altEnd,
                    ...destination
                });
                index = destination.destinationEnd;
            }
            continue;
        }

        if (content[cursor] === '[') {
            const labelEnd = findUnescapedCharacter(content, cursor + 1, ']');
            if (labelEnd === -1) {
                continue;
            }
            const alt = content.slice(index + 2, altEnd);
            const label = content.slice(cursor + 1, labelEnd) || alt;
            const definition = definitionDestinations.get(normalizeReferenceLabel(label));
            if (definition) {
                occurrences.push({
                    altStart: index + 2,
                    altEnd,
                    ...definition
                });
                index = labelEnd;
            }
        }
    }

    return occurrences;
}

function findReferenceDefinitions(
    content: string
): Map<string, Pick<ImageOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'>> {
    const definitions = new Map<string, Pick<ImageOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'>>();
    const definitionRegex = /^(?: {0,3})\[([^\]\r\n]+)\]:[ \t]*(<[^>\r\n]+>|[^\s\r\n]+)/gm;
    let match: RegExpExecArray | null;

    while ((match = definitionRegex.exec(content)) !== null) {
        const rawDestination = match[2];
        const destinationOffset = match[0].lastIndexOf(rawDestination);
        const destinationStart = match.index + destinationOffset;
        definitions.set(normalizeReferenceLabel(match[1]), {
            destinationStart,
            destinationEnd: destinationStart + rawDestination.length,
            destination: rawDestination
        });
    }

    return definitions;
}

function parseInlineDestination(
    content: string,
    openingOffset: number
): Pick<ImageOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'> | undefined {
    let cursor = openingOffset;
    while (cursor < content.length && /\s/.test(content[cursor])) {
        cursor++;
    }
    const destinationStart = cursor;

    if (content[cursor] === '<') {
        cursor++;
        while (cursor < content.length && content[cursor] !== '>' && !/[\r\n]/.test(content[cursor])) {
            cursor++;
        }
        if (content[cursor] !== '>') {
            return undefined;
        }
        cursor++;
    } else {
        let nestedParentheses = 0;
        while (cursor < content.length) {
            const character = content[cursor];
            if (character === '\\') {
                cursor += 2;
                continue;
            }
            if (character === '(') {
                nestedParentheses++;
                cursor++;
                continue;
            }
            if (character === ')') {
                if (nestedParentheses === 0) {
                    break;
                }
                nestedParentheses--;
                cursor++;
                continue;
            }
            if (/\s/.test(character)) {
                break;
            }
            cursor++;
        }
    }

    return {
        destinationStart,
        destinationEnd: cursor,
        destination: content.slice(destinationStart, cursor)
    };
}

function findUnescapedCharacter(content: string, start: number, target: string): number {
    for (let index = start; index < content.length; index++) {
        if (content[index] === target && !isEscaped(content, index)) {
            return index;
        }
        if (content[index] === '\r' || content[index] === '\n') {
            return -1;
        }
    }
    return -1;
}

function isEscaped(content: string, index: number): boolean {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor--) {
        slashCount++;
    }
    return slashCount % 2 === 1;
}

function normalizeReferenceLabel(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function parseLocalDestination(
    rawDestination: string
): { filePath: string; suffix: string } | undefined {
    const unwrapped = rawDestination.startsWith('<') && rawDestination.endsWith('>')
        ? rawDestination.slice(1, -1)
        : rawDestination;
    if (!unwrapped || unwrapped.startsWith('#') || unwrapped.startsWith('//')) {
        return undefined;
    }
    if (/^(?![a-z]:[\\/])[a-z][a-z0-9+.-]*:/i.test(unwrapped)
        && !unwrapped.toLocaleLowerCase().startsWith('file:')) {
        return undefined;
    }

    const suffixIndex = unwrapped.search(/[?#]/);
    const encodedPath = suffixIndex === -1 ? unwrapped : unwrapped.slice(0, suffixIndex);
    const suffix = suffixIndex === -1 ? '' : unwrapped.slice(suffixIndex);
    if (!encodedPath) {
        return undefined;
    }

    try {
        const filePath = encodedPath.toLocaleLowerCase().startsWith('file:')
            ? fileURLToPath(encodedPath)
            : decodeURIComponent(encodedPath).replace(/\\([\\()[\] ])/g, '$1');
        return { filePath, suffix };
    } catch {
        return { filePath: encodedPath, suffix };
    }
}

async function resolveDirect(
    markdownDirectory: string,
    referencePath: string
): Promise<ResolvedDestination | undefined> {
    const candidate = path.isAbsolute(referencePath)
        ? path.normalize(referencePath)
        : path.resolve(markdownDirectory, referencePath);
    return await isFile(candidate) ? { filePath: candidate, wasDirect: true } : undefined;
}

async function searchForImage(
    markdownDirectory: string,
    searchRoot: string,
    referencePath: string,
    imageDirectories: string[]
): Promise<ResolvedDestination | undefined> {
    const basename = path.basename(referencePath);
    const relativeTail = stripParentSegments(referencePath);
    const orderedImageDirectories = [...imageDirectories].sort((left, right) =>
        pathDistance(markdownDirectory, left) - pathDistance(markdownDirectory, right)
        || left.localeCompare(right)
    );

    for (const imageDirectory of orderedImageDirectories) {
        for (const candidate of uniquePaths([
            path.join(imageDirectory, relativeTail),
            path.join(imageDirectory, basename)
        ])) {
            if (await isFile(candidate)) {
                return { filePath: candidate, wasDirect: false };
            }
        }
        const nestedMatch = await findFileByBasename(imageDirectory, basename);
        if (nestedMatch) {
            return { filePath: nestedMatch, wasDirect: false };
        }
    }

    for (const ancestor of ancestorsWithin(markdownDirectory, searchRoot)) {
        for (const candidate of uniquePaths([
            path.resolve(ancestor, relativeTail),
            path.join(ancestor, basename),
            path.join(ancestor, 'image', relativeTail),
            path.join(ancestor, 'image', basename)
        ])) {
            if (await isFile(candidate)) {
                return { filePath: candidate, wasDirect: false };
            }
        }
    }

    return undefined;
}

async function findImageDirectories(searchRoot: string): Promise<string[]> {
    const found: string[] = [];
    const pending = [searchRoot];

    while (pending.length > 0) {
        const directory = pending.pop()!;
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory() || ignoredSearchDirectories.has(entry.name)) {
                continue;
            }
            const child = path.join(directory, entry.name);
            if (entry.name.toLocaleLowerCase() === 'image') {
                found.push(child);
            } else {
                pending.push(child);
            }
        }
    }

    return found;
}

async function findFileByBasename(directory: string, basename: string): Promise<string | undefined> {
    const pending = [directory];
    while (pending.length > 0) {
        const current = pending.shift()!;
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        } catch {
            continue;
        }

        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const child = path.join(current, entry.name);
            if (entry.isFile() && entry.name.toLocaleLowerCase() === basename.toLocaleLowerCase()) {
                return child;
            }
            if (entry.isDirectory() && !ignoredSearchDirectories.has(entry.name)) {
                pending.push(child);
            }
        }
    }
    return undefined;
}

function ancestorsWithin(start: string, searchRoot: string): string[] {
    const root = path.resolve(searchRoot);
    const ancestors: string[] = [];
    let current = path.resolve(start);

    while (isWithin(root, current)) {
        ancestors.push(current);
        if (samePath(current, root)) {
            break;
        }
        const parent = path.dirname(current);
        if (samePath(parent, current)) {
            break;
        }
        current = parent;
    }

    return ancestors;
}

function stripParentSegments(referencePath: string): string {
    const segments = referencePath
        .replace(/\\/g, '/')
        .split('/')
        .filter(segment => segment !== '' && segment !== '.' && segment !== '..');
    return segments.join(path.sep);
}

function hasImagePathSegment(filePath: string): boolean {
    return filePath
        .replace(/\\/g, '/')
        .split('/')
        .some(segment => segment.toLocaleLowerCase() === 'image');
}

async function reserveAvailableDestination(
    requestedDestination: string,
    source: string,
    reserved: Set<string>
): Promise<string> {
    const extension = path.extname(requestedDestination);
    const stem = requestedDestination.slice(0, requestedDestination.length - extension.length);
    let candidate = requestedDestination;
    let suffix = 2;

    while (reserved.has(normalizeForComparison(candidate))
        || (await pathExists(candidate) && !samePath(candidate, source))) {
        candidate = `${stem}-${suffix}${extension}`;
        suffix++;
    }

    reserved.add(normalizeForComparison(candidate));
    return candidate;
}

function formatMarkdownDestination(relativePath: string, suffix: string): string {
    let normalized = relativePath.replace(/\\/g, '/');
    if (!normalized.startsWith('.') && !normalized.startsWith('/')) {
        normalized = normalized || '.';
    }
    const encoded = normalized.replace(/#/g, '%23');
    return /\s/.test(encoded) ? `<${encoded}${suffix}>` : `${encoded}${suffix}`;
}

function addBrokenMarker(altText: string): string {
    return altText.includes(brokenImageMarker)
        ? altText
        : `${brokenImageMarker}${altText ? ` ${altText}` : ''}`;
}

function removeBrokenMarker(altText: string): string {
    return altText.replace(new RegExp(`^${brokenImageMarker}\\s*`), '');
}

function applyReplacements(content: string, replacements: Replacement[]): string {
    return [...replacements]
        .sort((left, right) => right.start - left.start)
        .reduce(
            (updated, replacement) =>
                updated.slice(0, replacement.start) + replacement.text + updated.slice(replacement.end),
            content
        );
}

function deduplicateReplacements(replacements: Replacement[]): Replacement[] {
    const unique = new Map<string, Replacement>();
    for (const replacement of replacements) {
        unique.set(`${replacement.start}:${replacement.end}`, replacement);
    }
    return [...unique.values()];
}

function deduplicateMoves(moves: MoveOperation[]): MoveOperation[] {
    const unique = new Map<string, MoveOperation>();
    for (const move of moves) {
        unique.set(normalizeForComparison(move.source), move);
    }
    return [...unique.values()];
}

async function moveFile(source: string, destination: string): Promise<void> {
    if (samePath(source, destination)) {
        return;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
        await fs.rename(source, destination);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
            throw error;
        }
        await fs.copyFile(source, destination);
        await fs.unlink(source);
    }
}

async function isFile(filePath: string): Promise<boolean> {
    try {
        return (await fs.stat(filePath)).isFile();
    } catch {
        return false;
    }
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function pathDistance(from: string, to: string): number {
    return path.relative(from, to).split(path.sep).filter(Boolean).length;
}

function isWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
    return normalizeForComparison(left) === normalizeForComparison(right);
}

function normalizeForComparison(filePath: string): string {
    const normalized = path.resolve(filePath);
    return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized;
}

function uniquePaths(paths: string[]): string[] {
    return [...new Map(paths.map(candidate => [normalizeForComparison(candidate), candidate])).values()];
}
