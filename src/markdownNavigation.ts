const atxHeadingPattern = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function findMarkdownHeadingLines(text: string): number[] {
    const headingLines: number[] = [];
    let openFence: { marker: '`' | '~'; length: number } | undefined;

    for (const [lineNumber, line] of text.split(/\r?\n/).entries()) {
        const fence = line.match(fencePattern);
        if (openFence) {
            if (fence
                && fence[1][0] === openFence.marker
                && fence[1].length >= openFence.length
                && fence[2].trim().length === 0) {
                openFence = undefined;
            }
            continue;
        }

        if (fence) {
            openFence = {
                marker: fence[1][0] as '`' | '~',
                length: fence[1].length
            };
            continue;
        }

        if (atxHeadingPattern.test(line)) {
            headingLines.push(lineNumber);
        }
    }

    return headingLines;
}

export function findMarkdownHeadingTargetLine(
    headingLines: readonly number[],
    currentLine: number
): number | undefined {
    if (headingLines.includes(currentLine)) {
        return headingLines.find(line => line > currentLine);
    }

    for (let index = headingLines.length - 1; index >= 0; index--) {
        if (headingLines[index] < currentLine) {
            return headingLines[index];
        }
    }
    return undefined;
}
