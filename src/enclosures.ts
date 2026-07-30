export type EnclosureKind =
    | 'parentheses'
    | 'squareBrackets'
    | 'curlyBrackets'
    | 'angleBrackets'
    | 'singleQuotes'
    | 'doubleQuotes'
    | 'backticks'
    | 'regex'
    | 'fence';

export interface Enclosure {
    kind: EnclosureKind;
    start: number;
    openingEnd: number;
    closingStart: number;
    end: number;
}

interface FenceToken {
    start: number;
    end: number;
    marker: '`' | '~';
    length: number;
    tail: string;
}

interface BracketOpening {
    kind: EnclosureKind;
    start: number;
    closing: string;
}

const cLikeLanguages = new Set([
    'c',
    'cpp',
    'csharp',
    'css',
    'dart',
    'go',
    'java',
    'javascript',
    'javascriptreact',
    'jsonc',
    'kotlin',
    'less',
    'objective-c',
    'php',
    'rust',
    'scss',
    'swift',
    'typescript',
    'typescriptreact'
]);

const hashCommentLanguages = new Set([
    'dockerfile',
    'makefile',
    'perl',
    'powershell',
    'python',
    'r',
    'ruby',
    'shellscript',
    'yaml'
]);

const markupLanguages = new Set([
    'html',
    'markdown',
    'mdx',
    'plaintext',
    'svelte',
    'vue',
    'xml',
    'xsl'
]);

const regexLanguages = new Set([
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact'
]);

function isEscaped(text: string, index: number, lowerBound: number): boolean {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= lowerBound && text[cursor] === '\\'; cursor--) {
        slashes++;
    }
    return slashes % 2 === 1;
}

function findFenceTokens(text: string): FenceToken[] {
    const tokens: FenceToken[] = [];
    let lineStart = 0;

    while (lineStart < text.length) {
        const newline = text.indexOf('\n', lineStart);
        const nextLineStart = newline === -1 ? text.length : newline + 1;
        let lineEnd = newline === -1 ? text.length : newline;
        if (lineEnd > lineStart && text[lineEnd - 1] === '\r') {
            lineEnd--;
        }

        const line = text.slice(lineStart, lineEnd);
        const match = line.match(/^([ \t]{0,3})(`{3,}|~{3,})(.*)$/);
        if (match) {
            const run = match[2];
            const start = lineStart + match[1].length;
            tokens.push({
                start,
                end: start + run.length,
                marker: run[0] as '`' | '~',
                length: run.length,
                tail: match[3]
            });
        }

        if (newline === -1) {
            break;
        }
        lineStart = nextLineStart;
    }

    return tokens;
}

function findFenceEnclosures(tokens: readonly FenceToken[]): Enclosure[] {
    const stack: FenceToken[] = [];
    const enclosures: Enclosure[] = [];

    for (const token of tokens) {
        const opening = stack[stack.length - 1];
        const closesOpening = opening
            && token.marker === opening.marker
            && token.length >= opening.length
            && token.tail.trim().length === 0;

        if (closesOpening) {
            stack.pop();
            enclosures.push({
                kind: 'fence',
                start: opening.start,
                openingEnd: opening.end,
                closingStart: token.start,
                end: token.end
            });
        } else {
            stack.push(token);
        }
    }

    return enclosures;
}

function getQuoteKind(quote: string): EnclosureKind {
    if (quote === '\'') {
        return 'singleQuotes';
    }
    if (quote === '"') {
        return 'doubleQuotes';
    }
    return 'backticks';
}

function isWordCharacter(character: string | undefined): boolean {
    return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

function findQuoteClose(
    text: string,
    start: number,
    limit: number,
    quote: string,
    delimiterLength: number,
    multiline: boolean
): number {
    for (let index = start + delimiterLength; index < limit; index++) {
        if (!multiline && (text[index] === '\r' || text[index] === '\n')) {
            return -1;
        }
        if (text[index] !== quote || isEscaped(text, index, start)) {
            continue;
        }

        if (delimiterLength > 1) {
            if (text.slice(index, index + delimiterLength) === quote.repeat(delimiterLength)) {
                return index;
            }
            continue;
        }

        if (text[index + 1] === quote && index + 1 < limit) {
            index++;
            continue;
        }
        return index;
    }
    return -1;
}

function findRegexClose(text: string, start: number, limit: number): number {
    let insideCharacterClass = false;
    for (let index = start + 1; index < limit; index++) {
        const character = text[index];
        if (character === '\r' || character === '\n') {
            return -1;
        }
        if (isEscaped(text, index, start)) {
            continue;
        }
        if (character === '[') {
            insideCharacterClass = true;
        } else if (character === ']') {
            insideCharacterClass = false;
        } else if (character === '/' && !insideCharacterClass) {
            return index;
        }
    }
    return -1;
}

function canStartRegex(text: string, index: number, lowerBound: number): boolean {
    let previous = index - 1;
    while (previous >= lowerBound && /\s/.test(text[previous])) {
        previous--;
    }
    if (previous < lowerBound) {
        return true;
    }
    if (/[\(\[\{=,:;!?&|+\-*%^~<>]/.test(text[previous])) {
        return true;
    }

    const prefix = text.slice(lowerBound, previous + 1);
    const word = prefix.match(/([A-Za-z_$][\w$]*)$/)?.[1];
    return word !== undefined && [
        'await',
        'case',
        'delete',
        'in',
        'instanceof',
        'new',
        'of',
        'return',
        'throw',
        'typeof',
        'void',
        'yield'
    ].includes(word);
}

function getLineCommentMarkers(languageId: string): string[] {
    if (cLikeLanguages.has(languageId)) {
        return ['//'];
    }
    if (languageId === 'sql') {
        return ['--'];
    }
    if (hashCommentLanguages.has(languageId)) {
        return ['#'];
    }
    return [];
}

function getBlockCommentMarkers(languageId: string): readonly [string, string][] {
    const markers: [string, string][] = [];
    if (cLikeLanguages.has(languageId) || languageId === 'sql') {
        markers.push(['/*', '*/']);
    }
    if (markupLanguages.has(languageId)) {
        markers.push(['<!--', '-->']);
    }
    return markers;
}

function parseRegularSegment(
    text: string,
    start: number,
    end: number,
    languageId: string
): Enclosure[] {
    const enclosures: Enclosure[] = [];
    const bracketStack: BracketOpening[] = [];
    const lineCommentMarkers = getLineCommentMarkers(languageId);
    const blockCommentMarkers = getBlockCommentMarkers(languageId);
    const multilineQuotes = languageId === 'csv'
        || languageId === 'tsv'
        || languageId === 'sql';
    const includeAngles = markupLanguages.has(languageId);

    for (let index = start; index < end;) {
        const blockComment = blockCommentMarkers.find(([opening]) =>
            text.startsWith(opening, index)
        );
        if (blockComment) {
            const closingIndex = text.indexOf(
                blockComment[1],
                index + blockComment[0].length
            );
            index = closingIndex === -1
                ? end
                : Math.min(end, closingIndex + blockComment[1].length);
            continue;
        }

        const lineComment = lineCommentMarkers.find(marker =>
            text.startsWith(marker, index)
        );
        if (lineComment) {
            const newline = text.indexOf('\n', index + lineComment.length);
            index = newline === -1 || newline >= end ? end : newline + 1;
            continue;
        }

        const character = text[index];
        if (character === '\'' || character === '"' || character === '`') {
            if (character === '\''
                && isWordCharacter(text[index - 1])
                && isWordCharacter(text[index + 1])) {
                index++;
                continue;
            }

            let runLength = 1;
            while (index + runLength < end && text[index + runLength] === character) {
                runLength++;
            }
            const delimiterLength = character === '`'
                ? runLength
                : runLength >= 3
                    ? 3
                    : 1;
            const closingStart = findQuoteClose(
                text,
                index,
                end,
                character,
                delimiterLength,
                multilineQuotes || character === '`' || delimiterLength > 1
            );
            if (closingStart !== -1) {
                enclosures.push({
                    kind: getQuoteKind(character),
                    start: index,
                    openingEnd: index + delimiterLength,
                    closingStart,
                    end: closingStart + delimiterLength
                });
                index = closingStart + delimiterLength;
                continue;
            }
        }

        if (character === '/'
            && regexLanguages.has(languageId)
            && canStartRegex(text, index, start)) {
            const closingStart = findRegexClose(text, index, end);
            if (closingStart !== -1) {
                enclosures.push({
                    kind: 'regex',
                    start: index,
                    openingEnd: index + 1,
                    closingStart,
                    end: closingStart + 1
                });
                index = closingStart + 1;
                continue;
            }
        }

        const opening = character === '('
            ? { kind: 'parentheses' as const, closing: ')' }
            : character === '['
                ? { kind: 'squareBrackets' as const, closing: ']' }
                : character === '{'
                    ? { kind: 'curlyBrackets' as const, closing: '}' }
                    : character === '<' && includeAngles
                        ? { kind: 'angleBrackets' as const, closing: '>' }
                        : undefined;
        if (opening) {
            bracketStack.push({ ...opening, start: index });
            index++;
            continue;
        }

        const bracketOpening = bracketStack[bracketStack.length - 1];
        if (bracketOpening?.closing === character) {
            bracketStack.pop();
            enclosures.push({
                kind: bracketOpening.kind,
                start: bracketOpening.start,
                openingEnd: bracketOpening.start + 1,
                closingStart: index,
                end: index + 1
            });
        }
        index++;
    }

    return enclosures;
}

export function findEnclosures(text: string, languageId = 'plaintext'): Enclosure[] {
    const fenceTokens = findFenceTokens(text);
    const enclosures = findFenceEnclosures(fenceTokens);
    let segmentStart = 0;

    for (const token of fenceTokens) {
        enclosures.push(...parseRegularSegment(text, segmentStart, token.start, languageId));
        segmentStart = token.end;
    }
    enclosures.push(...parseRegularSegment(text, segmentStart, text.length, languageId));

    return enclosures.sort((left, right) =>
        left.start - right.start || right.end - left.end
    );
}

function enclosureSize(enclosure: Enclosure): number {
    return enclosure.end - enclosure.start;
}

function boundaryPriority(enclosure: Enclosure, offset: number): number {
    if (enclosure.start === offset) {
        return 0;
    }
    if (enclosure.openingEnd === offset) {
        return 1;
    }
    if (enclosure.closingStart === offset) {
        return 2;
    }
    if (enclosure.end === offset) {
        return 3;
    }
    return 4;
}

export function findEnclosureAtOffset(
    enclosures: readonly Enclosure[],
    offset: number
): Enclosure | undefined {
    return enclosures
        .filter(enclosure => enclosure.start <= offset && enclosure.end >= offset)
        .sort((left, right) =>
            enclosureSize(left) - enclosureSize(right)
            || boundaryPriority(left, offset) - boundaryPriority(right, offset)
            || right.start - left.start
        )[0];
}

export function findEnclosureForRange(
    enclosures: readonly Enclosure[],
    start: number,
    end: number
): Enclosure | undefined {
    const containing = enclosures
        .filter(enclosure => enclosure.start <= start && enclosure.end >= end)
        .sort((left, right) =>
            enclosureSize(left) - enclosureSize(right) || right.start - left.start
        );
    const exact = containing.find(enclosure =>
        enclosure.start === start && enclosure.end === end
    );
    if (!exact) {
        return containing[0];
    }
    return containing.find(enclosure =>
        enclosure.start < exact.start || enclosure.end > exact.end
    );
}
