import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const brokenDocumentLinkMarker = '⛓️‍💥';

export interface RepairDocumentLinksResult {
    markdownPath: string;
    links: number;
    repaired: number;
    broken: number;
    unchanged: number;
}

export interface DocumentUsagePartition {
    referencedDocumentPaths: string[];
    unusedDocumentPaths: string[];
}

export interface MoveDocumentResult {
    sourcePath: string;
    destinationPath: string;
    incomingLinksUpdated: number;
    outgoingLinksUpdated: number;
    documentsUpdated: number;
}

export interface DocumentPathMove {
    sourcePath: string;
    destinationPath: string;
}

export interface DocumentContentUpdate {
    documentPath: string;
    originalContent: string;
    updatedContent: string;
}

export interface DocumentMoveLinkPlan {
    moves: DocumentPathMove[];
    updates: DocumentContentUpdate[];
    incomingLinksUpdated: number;
    outgoingLinksUpdated: number;
}

interface LinkOccurrence {
    labelStart: number;
    labelEnd: number;
    destinationStart: number;
    destinationEnd: number;
    destination: string;
}

interface ParsedDestination {
    filePath: string;
    suffix: string;
}

interface Replacement {
    start: number;
    end: number;
    text: string;
}

interface DestinationResolution {
    destination?: string;
    broken: boolean;
    repaired: boolean;
}

const markdownExtensions = new Set([
    '.markdown',
    '.md',
    '.mdown',
    '.mdx',
    '.mkd'
]);

const ignoredDirectories = new Set([
    '.git',
    '.hg',
    '.svn',
    '.vscode-test',
    'dist',
    'node_modules',
    'out'
]);

export function isMarkdownFilePath(filePath: string): boolean {
    return markdownExtensions.has(path.extname(filePath).toLocaleLowerCase());
}

export async function repairDocumentLinks(
    markdownPath: string,
    searchRoot: string
): Promise<RepairDocumentLinksResult> {
    const absoluteMarkdownPath = path.resolve(markdownPath);
    const absoluteSearchRoot = path.resolve(searchRoot);
    const markdownDirectory = path.dirname(absoluteMarkdownPath);
    const content = await fs.readFile(absoluteMarkdownPath, 'utf8');
    const occurrences = findMarkdownDocumentLinkOccurrences(content);
    const result: RepairDocumentLinksResult = {
        markdownPath: absoluteMarkdownPath,
        links: occurrences.length,
        repaired: 0,
        broken: 0,
        unchanged: 0
    };
    if (occurrences.length === 0) {
        return result;
    }

    const workspaceDocuments = await findMarkdownDocuments(absoluteSearchRoot);
    const documentsByBasename = groupDocumentsByBasename(workspaceDocuments);
    const resolutions = new Map<string, DestinationResolution>();
    const replacements: Replacement[] = [];

    for (const occurrence of occurrences) {
        const destinationKey = `${occurrence.destinationStart}:${occurrence.destinationEnd}`;
        let resolution = resolutions.get(destinationKey);
        if (!resolution) {
            const parsed = parseLocalMarkdownDestination(occurrence.destination);
            if (!parsed) {
                continue;
            }
            const directPath = resolveDestinationPath(markdownDirectory, parsed.filePath);
            if (await isFile(directPath)) {
                resolution = { broken: false, repaired: false };
            } else {
                const movedTarget = findMovedDocumentTarget(
                    parsed.filePath,
                    documentsByBasename,
                    absoluteSearchRoot
                );
                if (movedTarget) {
                    resolution = {
                        destination: formatMarkdownDestination(
                            path.relative(markdownDirectory, movedTarget),
                            parsed.suffix
                        ),
                        broken: false,
                        repaired: true
                    };
                } else {
                    resolution = { broken: true, repaired: false };
                }
            }
            resolutions.set(destinationKey, resolution);
        }

        const label = content.slice(occurrence.labelStart, occurrence.labelEnd);
        if (resolution.broken) {
            result.broken++;
            const markedLabel = addBrokenMarker(label);
            if (markedLabel !== label) {
                replacements.push({
                    start: occurrence.labelStart,
                    end: occurrence.labelEnd,
                    text: markedLabel
                });
            }
            continue;
        }

        const cleanedLabel = removeBrokenMarker(label);
        if (cleanedLabel !== label) {
            replacements.push({
                start: occurrence.labelStart,
                end: occurrence.labelEnd,
                text: cleanedLabel
            });
        }
        if (resolution.destination
            && resolution.destination !== occurrence.destination) {
            replacements.push({
                start: occurrence.destinationStart,
                end: occurrence.destinationEnd,
                text: resolution.destination
            });
        }
        if (resolution.repaired) {
            result.repaired++;
        } else {
            result.unchanged++;
        }
    }

    const updatedContent = applyReplacements(content, deduplicateReplacements(replacements));
    if (updatedContent !== content) {
        await fs.writeFile(absoluteMarkdownPath, updatedContent, 'utf8');
    }
    return result;
}

export async function partitionDocumentsByUsage(
    documentPaths: readonly string[],
    searchRoot: string
): Promise<DocumentUsagePartition> {
    const absoluteSearchRoot = path.resolve(searchRoot);
    const candidates = [...new Map(documentPaths
        .map(documentPath => path.resolve(documentPath))
        .filter(documentPath =>
            isMarkdownFilePath(documentPath)
            && isWithin(absoluteSearchRoot, documentPath)
        )
        .map(documentPath => [normalizeForComparison(documentPath), documentPath])
    ).values()];
    if (candidates.length === 0) {
        return { referencedDocumentPaths: [], unusedDocumentPaths: [] };
    }

    const candidateByKey = new Map(candidates.map(documentPath =>
        [normalizeForComparison(documentPath), documentPath] as const
    ));
    const referencedKeys = new Set<string>();
    const workspaceDocuments = await findMarkdownDocuments(absoluteSearchRoot);
    const documentsByBasename = groupDocumentsByBasename(workspaceDocuments);

    for (const sourcePath of workspaceDocuments) {
        let content: string;
        try {
            content = await fs.readFile(sourcePath, 'utf8');
        } catch {
            continue;
        }
        const sourceDirectory = path.dirname(sourcePath);
        const sourceKey = normalizeForComparison(sourcePath);
        for (const occurrence of findMarkdownDocumentLinkOccurrences(content)) {
            const parsed = parseLocalMarkdownDestination(occurrence.destination);
            if (!parsed) {
                continue;
            }
            const directPath = resolveDestinationPath(sourceDirectory, parsed.filePath);
            const targetPath = await isFile(directPath)
                ? directPath
                : findMovedDocumentTarget(
                    parsed.filePath,
                    documentsByBasename,
                    absoluteSearchRoot
                );
            if (!targetPath) {
                continue;
            }
            const targetKey = normalizeForComparison(targetPath);
            if (targetKey !== sourceKey && candidateByKey.has(targetKey)) {
                referencedKeys.add(targetKey);
            }
        }
    }

    return {
        referencedDocumentPaths: candidates.filter(documentPath =>
            referencedKeys.has(normalizeForComparison(documentPath))
        ),
        unusedDocumentPaths: candidates.filter(documentPath =>
            !referencedKeys.has(normalizeForComparison(documentPath))
        )
    };
}

export async function expandMarkdownPathMove(
    sourcePath: string,
    destinationPath: string
): Promise<DocumentPathMove[]> {
    const absoluteSourcePath = path.resolve(sourcePath);
    const absoluteDestinationPath = path.resolve(destinationPath);
    let stat;
    try {
        stat = await fs.stat(absoluteSourcePath);
    } catch {
        return [];
    }
    if (stat.isFile()) {
        return isMarkdownFilePath(absoluteSourcePath)
            && isMarkdownFilePath(absoluteDestinationPath)
            ? [{
                sourcePath: absoluteSourcePath,
                destinationPath: absoluteDestinationPath
            }]
            : [];
    }
    if (!stat.isDirectory()) {
        return [];
    }

    const moves: DocumentPathMove[] = [];
    const pending = [absoluteSourcePath];
    while (pending.length > 0) {
        const directory = pending.shift()!;
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const childPath = path.join(directory, entry.name);
            if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
                pending.push(childPath);
            } else if (entry.isFile() && isMarkdownFilePath(childPath)) {
                moves.push({
                    sourcePath: childPath,
                    destinationPath: path.join(
                        absoluteDestinationPath,
                        path.relative(absoluteSourcePath, childPath)
                    )
                });
            }
        }
    }
    return moves;
}

export async function planDocumentLinkUpdatesForMoves(
    moves: readonly DocumentPathMove[],
    searchRoot: string,
    contentOverrides: ReadonlyMap<string, string> = new Map()
): Promise<DocumentMoveLinkPlan> {
    const absoluteSearchRoot = path.resolve(searchRoot);
    const normalizedMoves = [...new Map(moves
        .map(move => ({
            sourcePath: path.resolve(move.sourcePath),
            destinationPath: path.resolve(move.destinationPath)
        }))
        .filter(move =>
            isMarkdownFilePath(move.sourcePath)
            && isMarkdownFilePath(move.destinationPath)
            && isWithin(absoluteSearchRoot, move.sourcePath)
            && isWithin(absoluteSearchRoot, move.destinationPath)
        )
        .map(move => [normalizeForComparison(move.sourcePath), move])
    ).values()];
    if (normalizedMoves.length === 0) {
        return {
            moves: [],
            updates: [],
            incomingLinksUpdated: 0,
            outgoingLinksUpdated: 0
        };
    }

    const moveBySourceKey = new Map(normalizedMoves.map(move =>
        [normalizeForComparison(move.sourcePath), move] as const
    ));
    const overridesByKey = new Map([...contentOverrides].map(([documentPath, content]) =>
        [normalizeForComparison(documentPath), content] as const
    ));
    const workspaceDocuments = await findMarkdownDocuments(absoluteSearchRoot);
    const updates: DocumentContentUpdate[] = [];
    const fileExistence = new Map<string, boolean>();
    let incomingLinksUpdated = 0;
    let outgoingLinksUpdated = 0;

    for (const documentPath of workspaceDocuments) {
        const documentKey = normalizeForComparison(documentPath);
        let content = overridesByKey.get(documentKey);
        if (content === undefined) {
            try {
                content = await fs.readFile(documentPath, 'utf8');
            } catch {
                continue;
            }
        }
        const documentMove = moveBySourceKey.get(documentKey);
        const updatedDocumentPath = documentMove?.destinationPath ?? documentPath;
        const replacements: Replacement[] = [];

        for (const occurrence of findMarkdownDocumentLinkOccurrences(content)) {
            const parsed = parseLocalMarkdownDestination(occurrence.destination);
            if (!parsed) {
                continue;
            }
            const resolvedPath = resolveDestinationPath(
                path.dirname(documentPath),
                parsed.filePath
            );
            const resolvedKey = normalizeForComparison(resolvedPath);
            let targetExists = fileExistence.get(resolvedKey);
            if (targetExists === undefined) {
                targetExists = await isFile(resolvedPath);
                fileExistence.set(resolvedKey, targetExists);
            }
            if (!targetExists) {
                continue;
            }

            const targetMove = moveBySourceKey.get(resolvedKey);
            if (!documentMove && !targetMove) {
                continue;
            }
            const updatedTargetPath = targetMove?.destinationPath ?? resolvedPath;
            const updatedDestination = formatMarkdownDestination(
                path.relative(path.dirname(updatedDocumentPath), updatedTargetPath),
                parsed.suffix
            );
            if (updatedDestination !== occurrence.destination) {
                replacements.push({
                    start: occurrence.destinationStart,
                    end: occurrence.destinationEnd,
                    text: updatedDestination
                });
                if (documentMove) {
                    outgoingLinksUpdated++;
                } else {
                    incomingLinksUpdated++;
                }
            }
            const label = content.slice(occurrence.labelStart, occurrence.labelEnd);
            const cleanedLabel = removeBrokenMarker(label);
            if (cleanedLabel !== label) {
                replacements.push({
                    start: occurrence.labelStart,
                    end: occurrence.labelEnd,
                    text: cleanedLabel
                });
            }
        }

        const updatedContent = applyReplacements(
            content,
            deduplicateReplacements(replacements)
        );
        if (updatedContent !== content) {
            updates.push({
                documentPath,
                originalContent: content,
                updatedContent
            });
        }
    }

    return {
        moves: normalizedMoves,
        updates,
        incomingLinksUpdated,
        outgoingLinksUpdated
    };
}

export async function moveDocumentWithLinks(
    sourcePath: string,
    destinationPath: string,
    searchRoot: string
): Promise<MoveDocumentResult> {
    const absoluteSourcePath = path.resolve(sourcePath);
    const absoluteDestinationPath = path.resolve(destinationPath);
    const absoluteSearchRoot = path.resolve(searchRoot);
    if (!isMarkdownFilePath(absoluteSourcePath)
        || !isMarkdownFilePath(absoluteDestinationPath)) {
        throw new Error('Both the original and new locations must be Markdown files.');
    }
    if (!isWithin(absoluteSearchRoot, absoluteSourcePath)
        || !isWithin(absoluteSearchRoot, absoluteDestinationPath)) {
        throw new Error('The new document location must remain inside the current workspace.');
    }
    if (samePath(absoluteSourcePath, absoluteDestinationPath)) {
        throw new Error('Choose a different location for the Markdown document.');
    }
    if (!await isFile(absoluteSourcePath)) {
        throw new Error(`Markdown document not found: ${absoluteSourcePath}`);
    }
    if (await pathExists(absoluteDestinationPath)) {
        throw new Error(`A file or folder already exists at: ${absoluteDestinationPath}`);
    }

    const plan = await planDocumentLinkUpdatesForMoves([{
        sourcePath: absoluteSourcePath,
        destinationPath: absoluteDestinationPath
    }], absoluteSearchRoot);

    await fs.mkdir(path.dirname(absoluteDestinationPath), { recursive: true });
    let moved = false;
    const writtenPaths: string[] = [];
    try {
        await moveFile(absoluteSourcePath, absoluteDestinationPath);
        moved = true;
        for (const update of plan.updates) {
            const outputPath = samePath(update.documentPath, absoluteSourcePath)
                ? absoluteDestinationPath
                : update.documentPath;
            await fs.writeFile(outputPath, update.updatedContent, 'utf8');
            writtenPaths.push(update.documentPath);
        }
    } catch (error) {
        for (const originalPath of writtenPaths.reverse()) {
            const restorePath = samePath(originalPath, absoluteSourcePath)
                ? absoluteDestinationPath
                : originalPath;
            const update = plan.updates.find(item =>
                samePath(item.documentPath, originalPath)
            );
            if (update) {
                try {
                    await fs.writeFile(restorePath, update.originalContent, 'utf8');
                } catch {
                    // Preserve the original move/update failure.
                }
            }
        }
        if (moved) {
            try {
                await moveFile(absoluteDestinationPath, absoluteSourcePath);
            } catch {
                // Preserve the original move/update failure.
            }
        }
        throw error;
    }

    return {
        sourcePath: absoluteSourcePath,
        destinationPath: absoluteDestinationPath,
        incomingLinksUpdated: plan.incomingLinksUpdated,
        outgoingLinksUpdated: plan.outgoingLinksUpdated,
        documentsUpdated: plan.updates.length
    };
}

function findMarkdownDocumentLinkOccurrences(content: string): LinkOccurrence[] {
    const occurrences: LinkOccurrence[] = [];
    const definitions = findReferenceDefinitions(content);

    for (let index = 0; index < content.length; index++) {
        if (content[index] !== '[' || isEscaped(content, index)) {
            continue;
        }
        if (index > 0 && content[index - 1] === '!' && !isEscaped(content, index - 1)) {
            const imageLabelEnd = findClosingBracket(content, index);
            if (imageLabelEnd !== -1) {
                index = imageLabelEnd;
            }
            continue;
        }

        const labelEnd = findClosingBracket(content, index);
        if (labelEnd === -1) {
            continue;
        }
        let cursor = labelEnd + 1;
        while (content[cursor] === ' ' || content[cursor] === '\t') {
            cursor++;
        }

        if (content[cursor] === '(') {
            const destination = parseInlineDestination(content, cursor + 1);
            if (destination && parseLocalMarkdownDestination(destination.destination)) {
                occurrences.push({
                    labelStart: index + 1,
                    labelEnd,
                    ...destination
                });
                index = destination.destinationEnd;
            }
            continue;
        }

        if (content[cursor] === '[') {
            const referenceEnd = findClosingBracket(content, cursor);
            if (referenceEnd === -1) {
                continue;
            }
            const label = content.slice(index + 1, labelEnd);
            const referenceLabel = content.slice(cursor + 1, referenceEnd) || label;
            const definition = definitions.get(normalizeReferenceLabel(referenceLabel));
            if (definition && parseLocalMarkdownDestination(definition.destination)) {
                occurrences.push({
                    labelStart: index + 1,
                    labelEnd,
                    ...definition
                });
                index = referenceEnd;
            }
        }
    }
    return occurrences;
}

function findReferenceDefinitions(
    content: string
): Map<string, Pick<LinkOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'>> {
    const definitions = new Map<
        string,
        Pick<LinkOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'>
    >();
    const definitionRegex = /^(?: {0,3})\[([^\]\r\n]+)\]:[ \t]*(<[^>\r\n]+>|[^\s\r\n]+)/gm;
    let match: RegExpExecArray | null;

    while ((match = definitionRegex.exec(content)) !== null) {
        const key = normalizeReferenceLabel(match[1]);
        if (definitions.has(key)) {
            continue;
        }
        const rawDestination = match[2];
        const destinationOffset = match[0].lastIndexOf(rawDestination);
        const destinationStart = match.index + destinationOffset;
        definitions.set(key, {
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
): Pick<LinkOccurrence, 'destinationStart' | 'destinationEnd' | 'destination'> | undefined {
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

function parseLocalMarkdownDestination(rawDestination: string): ParsedDestination | undefined {
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

    let filePath: string;
    try {
        filePath = encodedPath.toLocaleLowerCase().startsWith('file:')
            ? fileURLToPath(encodedPath)
            : decodeURIComponent(encodedPath).replace(/\\([\\()[\] ])/g, '$1');
    } catch {
        filePath = encodedPath;
    }
    return isMarkdownFilePath(filePath) ? { filePath, suffix } : undefined;
}

function resolveDestinationPath(sourceDirectory: string, destinationPath: string): string {
    return path.isAbsolute(destinationPath)
        ? path.normalize(destinationPath)
        : path.resolve(sourceDirectory, destinationPath);
}

function findMovedDocumentTarget(
    destinationPath: string,
    documentsByBasename: Map<string, string[]>,
    searchRoot: string
): string | undefined {
    const candidates = documentsByBasename.get(
        path.basename(destinationPath).toLocaleLowerCase()
    ) ?? [];
    if (candidates.length === 1) {
        return candidates[0];
    }
    if (candidates.length === 0) {
        return undefined;
    }

    const destinationSegments = normalizedSegments(destinationPath);
    const scored = candidates.map(candidate => ({
        candidate,
        score: commonSuffixLength(
            destinationSegments,
            normalizedSegments(path.relative(searchRoot, candidate))
        )
    }));
    const bestScore = Math.max(...scored.map(item => item.score));
    const bestMatches = scored.filter(item => item.score === bestScore);
    return bestScore > 1 && bestMatches.length === 1
        ? bestMatches[0].candidate
        : undefined;
}

async function findMarkdownDocuments(searchRoot: string): Promise<string[]> {
    const found: string[] = [];
    const pending = [path.resolve(searchRoot)];

    while (pending.length > 0) {
        const directory = pending.shift()!;
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const childPath = path.join(directory, entry.name);
            if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
                pending.push(childPath);
            } else if (entry.isFile() && isMarkdownFilePath(entry.name)) {
                found.push(childPath);
            }
        }
    }
    return found;
}

function groupDocumentsByBasename(documentPaths: readonly string[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const documentPath of documentPaths) {
        const key = path.basename(documentPath).toLocaleLowerCase();
        const group = grouped.get(key);
        if (group) {
            group.push(documentPath);
        } else {
            grouped.set(key, [documentPath]);
        }
    }
    return grouped;
}

function findClosingBracket(content: string, openingIndex: number): number {
    let depth = 0;
    for (let index = openingIndex; index < content.length; index++) {
        if (content[index] === '\r' || content[index] === '\n') {
            return -1;
        }
        if (isEscaped(content, index)) {
            continue;
        }
        if (content[index] === '[') {
            depth++;
        } else if (content[index] === ']') {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function normalizeReferenceLabel(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function isEscaped(content: string, index: number): boolean {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor--) {
        slashCount++;
    }
    return slashCount % 2 === 1;
}

function formatMarkdownDestination(relativePath: string, suffix: string): string {
    const normalized = relativePath.replace(/\\/g, '/') || '.';
    const encoded = normalized.replace(/#/g, '%23');
    return /\s/.test(encoded) ? `<${encoded}${suffix}>` : `${encoded}${suffix}`;
}

function addBrokenMarker(label: string): string {
    return label.startsWith(brokenDocumentLinkMarker)
        ? label
        : `${brokenDocumentLinkMarker}${label ? ` ${label}` : ''}`;
}

function removeBrokenMarker(label: string): string {
    return label.replace(new RegExp(`^${brokenDocumentLinkMarker}\\s*`), '');
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

function normalizedSegments(filePath: string): string[] {
    return filePath
        .replace(/\\/g, '/')
        .split('/')
        .filter(segment => segment !== '' && segment !== '.' && segment !== '..')
        .map(segment => segment.toLocaleLowerCase());
}

function commonSuffixLength(left: string[], right: string[]): number {
    let length = 0;
    while (length < left.length
        && length < right.length
        && left[left.length - 1 - length] === right[right.length - 1 - length]) {
        length++;
    }
    return length;
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

async function moveFile(source: string, destination: string): Promise<void> {
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

function samePath(left: string, right: string): boolean {
    return normalizeForComparison(left) === normalizeForComparison(right);
}

function isWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === ''
        || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeForComparison(filePath: string): string {
    const normalized = path.resolve(filePath);
    return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized;
}
