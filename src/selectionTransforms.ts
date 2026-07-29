const markdownTableSeparator = /^:?-+:?$/;

function trailingLineEnding(text: string): string {
    return text.match(/(?:\r\n|\r|\n)$/)?.[0] ?? '';
}

export function collapseToOneLine(text: string): string {
    const finalLineEnding = trailingLineEnding(text);
    const body = finalLineEnding
        ? text.slice(0, -finalLineEnding.length)
        : text;
    const collapsed = body
        .replace(/(?:[ \t]*(?:\r\n|\r|\n))+[ \t]*/g, ' ')
        .replace(/[ \t]+$/, match => match.length > 1 ? ' ' : match);

    return collapsed + finalLineEnding;
}

function parseMarkdownRow(line: string): string[] {
    const cells = line.split('|').map(cell => cell.trim());
    if (cells[0] === '') {
        cells.shift();
    }
    if (cells[cells.length - 1] === '') {
        cells.pop();
    }
    return cells;
}

function wrapCell(text: string, width: number): string[] {
    let remaining = text.trim();
    const wrapped: string[] = [];

    while (remaining.length > width) {
        const spaceIndex = remaining.lastIndexOf(' ', width);
        const breakIndex = spaceIndex > 0 ? spaceIndex : width;
        wrapped.push(remaining.slice(0, breakIndex).trimEnd());
        remaining = remaining.slice(breakIndex).trimStart();
    }

    wrapped.push(remaining);
    return wrapped;
}

export function wrapMarkdownTableColumns(text: string, width = 40): string {
    if (width < 1) {
        return text;
    }

    const finalLineEnding = trailingLineEnding(text);
    const lines = text
        .split(/\r\n|\r|\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    if (lines.length === 0 || lines.some(line => !line.includes('|'))) {
        return text;
    }

    const parsedRows = lines.map(parseMarkdownRow);
    const hasSeparator = parsedRows.some(row =>
        row.length > 0 && row.every(cell => markdownTableSeparator.test(cell))
    );
    const rows = parsedRows.filter(row =>
        !row.every(cell => markdownTableSeparator.test(cell))
    );
    if (rows.length === 0) {
        return text;
    }

    const columnCount = Math.max(...rows.map(row => row.length));
    const displayedRows: string[][] = [];
    for (const row of rows) {
        const wrappedCells = Array.from({ length: columnCount }, (_, columnIndex) =>
            wrapCell(row[columnIndex] ?? '', width)
        );
        const displayLineCount = Math.max(...wrappedCells.map(cell => cell.length));

        for (let displayLine = 0; displayLine < displayLineCount; displayLine++) {
            displayedRows.push(wrappedCells.map(cell => cell[displayLine] ?? ''));
        }
    }

    const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) =>
        Math.max(
            hasSeparator ? 3 : 0,
            ...displayedRows.map(row => row[columnIndex].length)
        )
    );
    const renderRow = (row: string[]) =>
        '| ' + row.map((cell, columnIndex) =>
            cell.padEnd(columnWidths[columnIndex], ' ')
        ).join(' | ') + ' |';

    const markdownLines: string[] = [];
    for (let rowIndex = 0; rowIndex < displayedRows.length; rowIndex++) {
        markdownLines.push(renderRow(displayedRows[rowIndex]));
        if (rowIndex === 0 && hasSeparator) {
            markdownLines.push(renderRow(columnWidths.map(columnWidth =>
                '-'.repeat(columnWidth)
            )));
        }
    }

    return markdownLines.join('\n') + finalLineEnding;
}
