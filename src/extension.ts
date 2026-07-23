// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import { unescape } from 'querystring';
import * as vscode from 'vscode';
import * as crypto from 'crypto-js';
import * as path from 'path';
const math = require('mathjs');
import { getEnvironmentData } from 'worker_threads';
import { writeHeapSnapshot } from 'v8';

type BucketSpan = 'day' | 'week' | 'month' | 'quarter' | 'year';
type LinkTemplate = {
    symbol: string;
    defaultTarget: string;
};

type MarkedLinkMatch = {
    range: vscode.Range;
    symbol: string;
    label: string;
    target: string;
};

export function buildAnchorDetails(relativeFilePath: string, zeroBasedLine: number) {
    const anchorId = `ref-${zeroBasedLine + 1}`;
    const normalizedPath = relativeFilePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
    return {
        anchorId,
        anchor: `<a id="${anchorId}"></a>`,
        bookmarkLink: `[${anchorId}](./${normalizedPath}#${anchorId})`
    };
}

class BucketFolderService {
    private static readonly lastFolderKey = 'caser.bucket.lastFolder';

    constructor(private readonly context: vscode.ExtensionContext) { }

    async showSaveDialog(overrides?: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
        const options = await this.mergeSaveOptions(overrides);
        const selection = await vscode.window.showSaveDialog(options);
        if (selection) {
            await this.rememberFolder(selection);
        }
        return selection;
    }

    async showOpenDialog(overrides?: vscode.OpenDialogOptions): Promise<vscode.Uri | undefined> {
        const options = await this.mergeOpenOptions(overrides);
        const selection = await vscode.window.showOpenDialog(options);
        if (selection && selection.length > 0) {
            await this.rememberFolder(selection[0]);
            return selection[0];
        }
        return undefined;
    }

    private async mergeSaveOptions(overrides?: vscode.SaveDialogOptions): Promise<vscode.SaveDialogOptions> {
        const defaultUri = overrides?.defaultUri ?? await this.getDefaultFolderUri();
        return {
            saveLabel: 'Save to bucket',
            defaultUri,
            ...overrides
        };
    }

    private async mergeOpenOptions(overrides?: vscode.OpenDialogOptions): Promise<vscode.OpenDialogOptions> {
        const defaultUri = overrides?.defaultUri ?? await this.getDefaultFolderUri();
        return {
            canSelectMany: false,
            openLabel: 'Load from bucket',
            defaultUri,
            ...overrides
        };
    }

    private async getDefaultFolderUri(): Promise<vscode.Uri | undefined> {
        const lastFolder = await this.getLastFolderUri();
        if (lastFolder) {
            return lastFolder;
        }
        return this.getBucketFolderUri();
    }

    private async getLastFolderUri(): Promise<vscode.Uri | undefined> {
        const stored = this.context.workspaceState.get<string>(BucketFolderService.lastFolderKey);
        if (!stored) {
            return undefined;
        }
        const candidate = vscode.Uri.parse(stored);
        if (await this.pathExists(candidate)) {
            return candidate;
        }
        return undefined;
    }

    private async rememberFolder(fileUri: vscode.Uri): Promise<void> {
        const folderUri = this.getFolderFromFileUri(fileUri);
        if (!folderUri) {
            return;
        }
        await this.context.workspaceState.update(BucketFolderService.lastFolderKey, folderUri.toString());
    }

    private getFolderFromFileUri(fileUri: vscode.Uri): vscode.Uri | undefined {
        const folderPath = path.dirname(fileUri.fsPath);
        if (!folderPath) {
            return undefined;
        }
        return vscode.Uri.file(folderPath);
    }

    private async getBucketFolderUri(): Promise<vscode.Uri | undefined> {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            return undefined;
        }
        const bucketName = this.getBucketName(new Date());
        const bucketUri = vscode.Uri.joinPath(workspaceRoot, '.data', bucketName);
        await this.ensureDirectory(bucketUri);
        return bucketUri;
    }

    private getBucketName(now: Date): string {
        const span = this.getBucketSpan();
        const year = now.getFullYear();
        switch (span) {
            case 'year':
                return `${year}`;
            case 'quarter': {
                const quarter = Math.floor(now.getMonth() / 3) + 1;
                return `${year}Q${quarter}`;
            }
            case 'month':
                return `${year}-${this.pad(now.getMonth() + 1)}`;
            case 'week': {
                const weekStart = this.getWeekStart(now);
                return `${weekStart.getFullYear()}-${this.pad(weekStart.getMonth() + 1)}-${this.pad(weekStart.getDate())}`;
            }
            case 'day':
            default:
                return `${year}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
        }
    }

    private getBucketSpan(): BucketSpan {
        const config = vscode.workspace.getConfiguration('caser');
        const value = config.get<string>('bucketSpan', 'week');
        if (value === 'day' || value === 'week' || value === 'month' || value === 'quarter' || value === 'year') {
            return value;
        }
        return 'week';
    }

    private pad(value: number): string {
        return value.toString().padStart(2, '0');
    }

    private getWeekStart(now: Date): Date {
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - day);
        return weekStart;
    }

    private getWorkspaceRoot(): vscode.Uri | undefined {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            if (folder) {
                return folder.uri;
            }
        }
        const fallback = vscode.workspace.workspaceFolders?.[0];
        return fallback?.uri;
    }

    private async ensureDirectory(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(uri);
        } catch {
            // ignore directory creation issues, fs.createDirectory is idempotent
        }
    }

    private async pathExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // ////////////////////////////////////////////////////////////
    // TODO: 01
    // Add your function in this section then look for TODO: 02
    ///////////////////////////////////////////////////////////////

    let isDimActive = vscode.workspace
        .getConfiguration('caser')
        .get<boolean>('dimActive', true);
    const bucketFolders = new BucketFolderService(context);
    let toFilePath: string | undefined;

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Caser support is loaded for camelCase, snake_case, kebab-case, PascalCase, UPPER_CASE, lower_case, Title Case, and Space Case, escape and unescape');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    // const disposable = vscode.commands.registerCommand('caser.helloWorld', () => {
    // 	// The code you place here will be executed every time your command is executed
    // 	// Display a message box to the user
    // 	vscode.window.showInformationMessage('Hello World from Nix Caser!');
    // });
    function camelCase(str: string) {
        // Using replace method with regEx
        return str.replace(/[-_]+/g, ' ').replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }
    function snakeCase(str: string) {
        return str && (str.match(
            /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g) ?? [])
            .map(s => s.toLowerCase())
            .join('_');
    }
    function kebabCase(str: string) {
        return str && (str.match(
            /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g) ?? [])
            .map(s => s.toLowerCase())
            .join('-');
    }
    function pascallCase(str: string) {
        return str.replace(/[-_]+/g, ' ').replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
            return index === 0 ? word.toUpperCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }
    function upperCase(str: string) {
        return str.toUpperCase();
    }
    function lowerCase(str: string) {
        return str.toLowerCase();
    }
    function titleCase(str: string) {
        return str.replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    function spaceCase(str: string) {
        return str.replace(/(?<=[a-z])(?=[A-Z])/g, ' ').replace(/[-_]+/g, ' ');
    };
    function escape(str: string) {
        return str.replace(/[\"]+/g, '\\"');
    }
    function unEscape(str: string) {
        return str.replace(/\\\"/g, '"');
    }
    function UnixSlash(str: string) {
        return str.replace(/\\/g, '/');
    }
    function DosSlash(str: string) {
        return str.replace(/\//g, '\\');
    }
    const head = '<>-<';
    const tail = '>-<>';
    function clear(str: string) {
        if (str.startsWith(head) && str.endsWith(tail)) {
            return crypto.enc.Base64.parse(str.substring(head.length, str.length - tail.length)).toString(crypto.enc.Utf8);
        }
        else {
            return str;
        }
    }
    function clearSafe(str: string) {
        let local = process.env.VSCODE_KEY;
        if (local === undefined) {
            local = 'lbfpjhblfdahpfr';
        }
        const decrypted = crypto.AES.decrypt(str, local);
        return decrypted.toString(crypto.enc.Utf8);
    }
    function secureSafe(str: string) {
        let local = process.env.VSCODE_KEY?.toString();
        if (local === undefined) {
            local = 'lbfpjhblfdahpfr';
        }
        return head + crypto.AES.encrypt(str, local).toString() + tail;
    }
    function flip(str: string) {
        if (str.startsWith(head) && str.endsWith(tail)) {
            return clearSafe(str.substring(head.length, str.length - tail.length));
        }
        else {
            return secureSafe(str);
        }
    }
    function secure(str: string) {
        return head + crypto.enc.Utf8.parse(str).toString(crypto.enc.Base64) + tail;
    }
    function defaultToLineSelected(
        editor: vscode.TextEditor,
        selection: vscode.Selection): vscode.Selection {
        if (!editor) {
            return selection;
        }
        if (selection.isEmpty) {
            const line = editor.document.lineAt(selection.start.line);
            return new vscode.Selection(line.range.start, line.range.end);
        }
        return selection;
    }
    function defaultToOtherCaseSelected(
        editor: vscode.TextEditor,
        selection: vscode.Selection): vscode.Selection {
        if (!selection.isEmpty) {
            return selection;
        }
        const cursor = selection.active;
        const line = editor.document.lineAt(cursor.line);
        const candidatePositions = [cursor];
        if (cursor.character > 0) {
            candidatePositions.push(cursor.translate(0, -1));
        }
        if (cursor.character < line.text.length) {
            candidatePositions.push(cursor.translate(0, 1));
        }

        const word = candidatePositions
            .map(position => editor.document.getWordRangeAtPosition(position))
            .find(range => range?.contains(cursor));
        if (word) {
            return new vscode.Selection(word.start, word.end);
        }
        return selection;
    }
    function selectionToLineNumbers(selection: vscode.Selection): number[] {
        let startLine = selection.start.line;
        let endLine = selection.end.line;

        // A multi-line selection ending at column 0 should not process the trailing line.
        if (!selection.isEmpty && selection.end.character === 0 && endLine > startLine) {
            endLine--;
        }

        const lines: number[] = [];
        for (let line = startLine; line <= endLine; line++) {
            lines.push(line);
        }
        return lines;
    }
    function getAdjustedUniqueLineSelections(
        editor: vscode.TextEditor,
        selections: readonly vscode.Selection[]
    ): vscode.Selection[] {
        const uniqueSelections: vscode.Selection[] = [];
        const seenLines = new Set<number>();

        for (const selection of selections) {
            for (const line of selectionToLineNumbers(selection)) {
                if (seenLines.has(line)) {
                    continue;
                }
                seenLines.add(line);
                const lineSelection = new vscode.Selection(line, 0, line, 0);
                uniqueSelections.push(AdjustSelectionForPrefix(editor, lineSelection));
            }
        }

        return uniqueSelections;
    }
    async function applyLineMarking(
        editor: vscode.TextEditor,
        buildReplacement: (selection: vscode.Selection) => string
    ): Promise<void> {
        const document = editor.document;
        const targetSelections = getAdjustedUniqueLineSelections(editor, editor.selections);

        await editor.edit(builder => {
            for (const selection of targetSelections) {
                builder.replace(selection, buildReplacement(selection));
            }
        });

        editor.selections = targetSelections.map(selection => {
            const lineEnd = document.lineAt(selection.start.line).range.end;
            return new vscode.Selection(lineEnd, lineEnd);
        });
    }
    function parseLinkTemplate(template: string): LinkTemplate {
        const match = template.match(/^\[(.*)\]\((.*)\)$/);
        return {
            symbol: match?.[1] ?? template,
            defaultTarget: match?.[2] ?? ''
        };
    }
    function normalizeInlineText(text: string): string {
        return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function escapeRegExp(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function buildMarkedLinkRegex(templates: LinkTemplate[]): RegExp {
        const symbols = templates.map(template => escapeRegExp(template.symbol)).join('|');
        return new RegExp(`\\[(${symbols})(?:\\s([^\\]]*))?\\]\\(([^)]*)\\)`, 'g');
    }
    function findMarkedLinkMatch(
        editor: vscode.TextEditor,
        selection: vscode.Selection,
        templates: LinkTemplate[]
    ): MarkedLinkMatch | undefined {
        if (selection.start.line !== selection.end.line) {
            return undefined;
        }

        const line = editor.document.lineAt(selection.start.line);
        const lineStartOffset = editor.document.offsetAt(line.range.start);
        const selectionStartOffset = editor.document.offsetAt(selection.start);
        const selectionEndOffset = editor.document.offsetAt(selection.end);
        const regex = buildMarkedLinkRegex(templates);

        let match: RegExpExecArray | null;
        while ((match = regex.exec(line.text)) !== null) {
            const matchStartOffset = lineStartOffset + match.index;
            const matchEndOffset = matchStartOffset + match[0].length;
            const overlaps = selection.isEmpty
                ? selectionStartOffset >= matchStartOffset && selectionStartOffset <= matchEndOffset
                : !(selectionEndOffset <= matchStartOffset || selectionStartOffset >= matchEndOffset);

            if (!overlaps) {
                continue;
            }

            return {
                range: new vscode.Range(
                    editor.document.positionAt(matchStartOffset),
                    editor.document.positionAt(matchEndOffset)
                ),
                symbol: match[1] ?? '',
                label: match[2] ?? '',
                target: match[3] ?? ''
            };
        }

        return undefined;
    }
    function cycleLinkTemplate(templates: LinkTemplate[], symbol: string): LinkTemplate {
        const currentIndex = templates.findIndex(template => template.symbol === symbol);
        if (currentIndex === -1) {
            return templates[0];
        }
        return templates[(currentIndex + 1) % templates.length];
    }
    function buildLinkTarget(template: LinkTemplate, clipboardText: string): string {
        const normalizedClipboard = normalizeInlineText(clipboardText);
        if (!normalizedClipboard) {
            return template.defaultTarget;
        }
        if (template.defaultTarget && !normalizedClipboard.startsWith(template.defaultTarget)) {
            return template.defaultTarget + normalizedClipboard;
        }
        return normalizedClipboard;
    }
    function buildMarkedLink(template: LinkTemplate, label: string, target: string): string {
        const bracketText = `${template.symbol} ${label}`;
        return `[${bracketText}](${target})`;
    }
    type OtherCaseState = 'upper' | 'lower' | 'title';

    function getOtherCaseState(text: string): OtherCaseState {
        if (text === text.toUpperCase()) {
            return 'upper';
        }
        if (text === text.toLowerCase()) {
            return 'lower';
        }
        return 'title';
    }

    function getSharedOtherCaseState(texts: string[]): OtherCaseState {
        const states = texts.map(getOtherCaseState);
        const firstState = states[0] ?? 'title';
        if (texts.length > 1 && states.some(state => state !== firstState)) {
            return 'title';
        }
        return firstState;
    }

    function toNextOtherCase(text: string, state: OtherCaseState): string {
        switch (state) {
            case 'upper':
                return text.toLowerCase();
            case 'lower':
                return titleCase(text);
            case 'title':
                return text.toUpperCase();
        }
    }

    function defaultToWordSelected(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) { // if the current selection is empty, expand it
            const word = editor.document.getWordRangeAtPosition(selection.start);
            if (word) {
                editor.selection = new vscode.Selection(word.start, word.end);
            }
        }
    };
    function stripWhiteSpace(text: string) {
        return text.replace(/\s{2,100}/g, ' ');
    }
    function cycleMarkdownIndent(lineText: string): string {
        const bulletMatch = lineText.match(/^([ \t]*)- (.*)$/);
        if (!bulletMatch) {
            return '- ' + lineText;
        }

        const indentation = bulletMatch[1];
        if (indentation.length < 4) {
            return '  ' + lineText;
        }

        return bulletMatch[2];
    }
    const specialLineCommentStart = '<!-- !! ';
    const specialLineCommentEnd = ' !! -->';

    function wrapLineCommentSegment(text: string): string {
        const match = text.match(/^(\s*)(.*?\S)(\s*)$/);
        if (!match) {
            return text;
        }

        return match[1]
            + specialLineCommentStart
            + match[2]
            + specialLineCommentEnd
            + match[3];
    }

    function commentUncommentedLineSegments(
        lineText: string,
        startsInsideComment: boolean
    ): { text: string; endsInsideComment: boolean } {
        let result = '';
        let offset = 0;
        let insideComment = startsInsideComment;

        while (offset < lineText.length) {
            if (insideComment) {
                const commentEnd = lineText.indexOf('-->', offset);
                if (commentEnd === -1) {
                    result += lineText.slice(offset);
                    return { text: result, endsInsideComment: true };
                }

                result += lineText.slice(offset, commentEnd + 3);
                offset = commentEnd + 3;
                insideComment = false;
                continue;
            }

            const commentStart = lineText.indexOf('<!--', offset);
            const plainTextEnd = commentStart === -1 ? lineText.length : commentStart;
            result += wrapLineCommentSegment(lineText.slice(offset, plainTextEnd));

            if (commentStart === -1) {
                return { text: result, endsInsideComment: false };
            }

            const commentEnd = lineText.indexOf('-->', commentStart + 4);
            if (commentEnd === -1) {
                result += lineText.slice(commentStart);
                return { text: result, endsInsideComment: true };
            }

            result += lineText.slice(commentStart, commentEnd + 3);
            offset = commentEnd + 3;
        }

        return { text: result, endsInsideComment: insideComment };
    }

    function removeSpecialLineComments(lineText: string): string {
        return lineText.replace(/<!-- !! (.*?) !! -->/g, '$1');
    }
    function NumericSequence(
        editor: vscode.TextEditor,
        selections: readonly vscode.Selection[]
    ) {
        const document = editor.document;
        const trailingNumber = (text: string) => {
            const match = text.match(/([+-]?)(\d+)$/);
            if (!match || match.index === undefined) {
                return;
            }
            return {
                prefix: text.slice(0, match.index),
                sign: match[1] ?? '',
                digits: match[2]
            };
        };
        const ranges = selections.map(selection => document.getWordRangeAtPosition(selection.start) ?? selection);
        if (ranges.length === 0) {
            return;
        }
        const seedText = document.getText(ranges[0]);
        const seedMatch = trailingNumber(seedText);
        let current = seedMatch ? parseInt(`${seedMatch.sign}${seedMatch.digits}`, 10) : 1;
        if (Number.isNaN(current)) {
            current = 1;
        }
        let nextValue = current;
        editor.edit(builder => {
            for (const range of ranges) {
                const text = document.getText(range);
                const match = trailingNumber(text);
                if (match) {
                    const sign = nextValue < 0 ? '-' : (nextValue > 0 && match.sign === '+') ? '+' : '';
                    const replacement = sign + Math.abs(nextValue).toString();
                    builder.replace(range, match.prefix + replacement);
                }
                else {
                    builder.replace(range, text + nextValue.toString());
                }
                nextValue++;
            }
        });
    }
    function FindMarked(editor: vscode.TextEditor | undefined) {
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            const start = '<>-<';
            const end = '>-<>';
            // if only one selection and it is empty
            // extend the selection to include the whole line
            if (selections.length === 1) {
                const selection = selections[0];
                if (!selection.isEmpty) {
                    return;
                }
                const line = document.lineAt(selection.start.line);
                // find if there is a start marker in the line
                const startIndex = line.text.indexOf(start);
                if (startIndex >= 0) {
                    // if found, find the end marker
                    const endIndex = line.text.indexOf(end, startIndex + start.length);
                    if (endIndex >= 0) {
                        // if found, extend the selection to include the markers
                        editor.selections = [new vscode.Selection(
                            line.range.start.translate(0, startIndex),
                            line.range.start.translate(0, endIndex + end.length)
                        )];
                        return;
                    }
                }
                // otherwise, select the whole line.
                editor.selections = [new vscode.Selection(
                    line.range.start,
                    line.range.end
                )];
            }
        }
    }
    function processSelections(
        editor: vscode.TextEditor,
        setA: string[],
        newSelections: vscode.Selection[]
    ) {
        const document = editor.document;

        editor.edit(builder => {
            for (const selection of newSelections) {
                const line = document.getText(selection);
                const characters = [...line];
                const firstChar = characters[0];

                if (!firstChar) {
                    continue; // Skip empty lines
                }

                const index = setA.indexOf(firstChar);
                if (index >= 0) {
                    const newText = setA[(index + 1) % setA.length] + line.slice(firstChar.length);
                    builder.replace(selection, newText);
                } else {
                    const newText = setA[0] + ' ' + line;
                    builder.replace(selection, newText);
                }
            }
        });

        editor.selections = newSelections;
    }
    function RemoveSymbols(
        editor: vscode.TextEditor,
        fromSet: string[]
    ) {
        const document = editor.document;

        const selections = editor.selections;
        editor.edit(builder => {
            for (const selection of selections) {
                const adjustedSelection = defaultToLineSelected(editor, selection);
                // Get the text of the selection
                const text = document.getText(adjustedSelection);
                let newText = text;
                for (const symbol of fromSet) {
                    newText = newText.replace(symbol, '');
                }
                // Replace the selection with the updated text
                builder.replace(adjustedSelection, newText);
            }
        });
    }

    function AdjustSelectionForPrefix(
        editor: vscode.TextEditor,
        selection: vscode.Selection
    ): vscode.Selection {
        const document = editor.document;
        //const selections = editor.selections;
        //const newSelections: vscode.Selection[] = [];
        //defaultToLineSelected(editor);
        //for (const selection of selections) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        for (let line = startLine; line <= endLine; line++) {
            const lineRange = document.lineAt(line).range;
            if (lineRange.isEmpty) {
                continue; // skip empty lines
            }
            // skip over any combination at the start of the line of spaces and tabs
            const lineText = document.getText(lineRange);
            // use regex to skip over any combination of tabs or spaces, followed by one of
            // '* ', '- ', or a number followed by a decimal point and a space, or a sequence of hashes
            // const regex = /(?:^[ \t]*|\d+\.{1}|\s)*(?:[#]+|[>]{1}|[*]{1}|[-]{1}|[+]{1}|(?:\d+\.{1}){0,1}[\t ]+)* (.*$)/;
            const regex = /(?:^[ \t]*|\d+\.{1}|\s)*(?:[#]+|[>]{1}|[*]{1}|[-]{1}|[+]{1}|(?:\d+\.{1}){0,1}[\t ]+|<!--)* (.*$)/;
            const match = lineText.match(regex);
            // we have an edge condition where the line starts with a symbol followed by a space.
            if (match && (match.input?.length ?? 0) - match[0]?.length > 1) {
                // return the entire line
                return new vscode.Selection(lineRange.start, lineRange.end);
            }
            if (match && match[1]?.length > 0) {
                // if we have a match, adjust the start of the selection to skip over it
                var offset = match[0].length - match[1].length;
                // if the match is at the start of the line, adjust the start of the selection
                // to the end of the match
                if (match[0].startsWith(match[1])) {
                    offset = 0;
                }
                const start = lineRange.start.translate(0, offset);
                const end = lineRange.end;

                return new vscode.Selection(start, end);
            }
            else {
                // if no match, just use the whole line
                return new vscode.Selection(lineRange.start, lineRange.end);
            }
        }
        return selection;
        //}
        // set the editor to the new selections

    }
    function ComputeSymbolReplacement(
        text: string,
        fromSet: string[],
        removeSet: string[]
    ): string {
        var newText = text;
        let didReplace = false;
        for (const symbol of fromSet) {
            // If the text starts with the symbol, replace it
            if (newText.startsWith(symbol)) {
                let ix = (fromSet.indexOf(symbol) + 1) % fromSet.length;
                for (const removeSymbol of removeSet) {
                    if (removeSymbol !== symbol) {
                        newText = newText.replace(removeSymbol, '');
                    }
                }
                newText = newText.replace(symbol, fromSet[ix]);
                didReplace = true;
                break; // Exit the loop once a match is found
            }
        }
        if (!didReplace) {
            for (const removeSymbol of removeSet) {
                newText = newText.replace(removeSymbol, '');
            }
            newText = fromSet[0] + ' ' + newText;
        }
        return newText;
    }
    function atStartSpaced(
        editor: vscode.TextEditor,
    ) {
        // If the cursor is at an end guillemot move it to the start of tye start guillemot
        const document = editor.document;
        const selections = editor.selections;
        const newSelections = [];
        for (const selection of selections) {
            const line = document.lineAt(selection.start.line);
            const lineText = line.text;
            let position = selection.start.character;

            if (position > 0) {
                // Get the character before the cursor
                const charBefore = lineText.charAt(position - 1);

                if (charBefore === '\u226B') { // Check for the closing guillemot (≫)
                    // Move backward to find the opening guillemot (≪)
                    while (position > 0) {
                        position--;
                        const currentChar = lineText.charAt(position);

                        if (currentChar === '\u226A') { // Found the opening guillemot (≪)
                            const newPos = new vscode.Position(selection.start.line, position);
                            newSelections.push(new vscode.Selection(newPos, newPos));
                            break;
                        }

                        // Stop if we reach the start of the line
                        if (position === 0) {
                            newSelections.push(selection);
                            break;
                        }
                    }
                } else {
                    newSelections.push(selection);
                }
            } else {
                newSelections.push(selection);
            }
        }
        // for (const selection of selections) {
        //     const line = document.lineAt(selection.start.line);
        //     const lineRange = line.range;
        //     var position = selection.start.character;
        //     if (selection.start.character > 2) {
        //         var ix = line.text.charAt(selection.start.character - 1);
        //         var ixx;
        //         if (ix === '\u226b') {
        //             // if found, move the selection back to the start of the guillemot
        //             do {
        //                 position--;
        //                 let ixx = line.text.charAt(position);
        //                 if (ixx === undefined) {
        //                     break;
        //                 }
        //             }
        //             while (ixx !== '\u226a' && position !== 0);
        //             if (position >= 0) {
        //                 var x = new vscode.Position(selection.start.line, position);
        //                 newSelections.push(new vscode.Selection(x, x));
        //             }
        //             else {
        //                 newSelections.push(selection);
        //             }
        //         }
        //         else {
        //             newSelections.push(selection);
        //         }
        //     }
        // }
        editor.selections = newSelections;
    }

    // Helper function to check if a character is a low surrogate
    function isLowSurrogate(charCode: number): boolean {
        return charCode >= 0xDC00 && charCode <= 0xDFFF;
    }
    // function atStartSpaced(
    //     editor: vscode.TextEditor
    // ) {
    //     //if the cursor is at the end of a space, move it to the start of the space
    //     const document = editor.document;
    //     const selections = editor.selections;
    //     const newSelections = [];
    //     for (const selection of selections) {
    //         const line = document.lineAt(selection.start.line);
    //         const lineRange = line.range;
    //         const lineText = document.getText(lineRange);
    //         // see if there is a space before the cursor
    //         if (selection.start.character > 0) {
    //             const ix = lineText.indexOf(' ', selection.start.character - 1);
    //             if (ix > -1) {
    //                 // if found, move the selection back one
    //                 newSelections.push(new vscode.Selection(selection.start.translate(0, -1), selection.start.translate(0, -1)));
    //                 continue;
    //             }
    //             else {
    //                 newSelections.push(selection);
    //             }
    //         }
    //         else {
    //             newSelections.push(selection);
    //         }
    //     }
    // }
    function atEndSpaced(
        editor: vscode.TextEditor,
    ) {
        // move the current insertion point to the end of the current selection
        const document = editor.document;
        const selections = editor.selections;
        const newSelections = [];
        for (const selection of selections) {
            const line = document.lineAt(selection.start.line);
            const lineRange = line.range;
            const lineText = document.getText(lineRange);
            // find the first space in the line
            const ix = lineText.indexOf(' ', selection.start.character);
            if (ix > -1) {
                // if found, move the selection to the end of the space
                newSelections.push(new vscode.Selection(line.range.start.translate(0, ix), line.range.start.translate(0, ix)));
            }
            else {
                newSelections.push(new vscode.Selection(selection.end.translate(0, 1), selection.end.translate(0, 1)));
            }
        }
        editor.selections = newSelections;
    }
    function selectWord(
        editor: vscode.TextEditor,
        selection: vscode.Selection
    ): vscode.Selection {
        // if the current selection is empty, expand it
        const word = editor.document.getWordRangeAtPosition(selection.start);
        if (word) {
            return new vscode.Selection(word.start, word.end);
        }
        return selection;
    }

    function SelectAllAtLeft(
        editor: vscode.TextEditor
    ) {
        const selections = editor.selections;
        const document = editor.document;
        const newSelections: vscode.Selection[] = [];
        for (const selection of selections) {
            const startLine = selection.start.line;
            const endLine = selection.end.line;
            for (let line = startLine; line <= endLine; line++) {
                const lineRange = document.lineAt(line).range;
                newSelections.push(new vscode.Selection(lineRange.start, lineRange.start));
            }
        }
        editor.selections = newSelections;
    }
    async function doSymbolsInPlace(
        editor: vscode.TextEditor,
        fromSet: string[],
        replaceSet: string[]
    ) {
        const document = editor.document;
        const selections = editor.selections;
        const newSelections: vscode.Selection[] = [];
        await editor.edit(builder => {
            for (const selection of selections) {
                const sel1 = AdjustSelectionForPrefix(editor, selection);
                // Get the text of the selection
                const sel2 = selectSymbol(editor, sel1, fromSet);
                const text = document.getText(sel2);
                let newText = text;
                var didReplace = false;
                var insertedText = '';
                for (var ix = 0; ix < fromSet.length; ix++) {
                    // If the text starts with the symbol, replace it
                    // find the symbol in the selected text
                    if (fromSet[ix] === newText) {
                        ix = (ix + 1) % fromSet.length;
                        insertedText = fromSet[ix];
                        newText = insertedText;
                        didReplace = true;
                        break; // Exit the loop once a match is found
                    }
                    else {
                        continue;
                    }
                }

                if (!didReplace) {
                    // split the selectin into two parts
                    // the first part is the text before the symbol
                    // the second part is the text after the symbol
                    const start = text.substring(0, selection.start.character);
                    const rest = text.substring(selection.start.character);
                    insertedText = fromSet[0];
                    newText = start + insertedText + rest;
                    //position = new vscode.Selection(selection.start.translate(0, -1 * insertedText.length), selection.start,);
                }
                // Replace the selection with the updated text
                builder.replace(selection, newText);

                // push a new selection starting at the original position and including the new text

            }
        });
        for (const selection of selections) {
            newSelections.push(selectSymbol(editor, selection, fromSet));
        }
        editor.selections = newSelections;
    }

    ///////////////////////////////////////////////////////////////////////////
    // want to simply select an instance of a symbol set near to the cursor 
    function selectSymbol(
        editor: vscode.TextEditor,
        selection: vscode.Selection,
        set: string[]): vscode.Selection {
        const document = editor.document;
        var xPosition = selection.start.character;
        if (xPosition > 4) {
            xPosition -= 4;
        } else {
            xPosition = 0;
        }
        const line = document.lineAt(selection.start.line);
        const lineRange = line.range;
        const lineText = document.getText(lineRange);
        for (const symbol of set) {
            // find the symbol in the selected text
            const ix = lineText.indexOf(symbol, xPosition);
            if (ix > -1) {
                // if found, extend the selection to include the markers
                const start = line.range.start.translate(0, ix);
                const end = line.range.start.translate(0, ix + symbol.length);
                return new vscode.Selection(start, end);
            }
        }
        // if not found, return the start of original selection
        return new vscode.Selection(selection.start, selection.start);
    }
    function processAtSelections(
        editor: vscode.TextEditor,
        setA: string[],
        newSelections: vscode.Selection[]
    ) {
        const document = editor.document;

        editor.edit(builder => {
            for (const selection of newSelections) {
                const line = document.getText(selection);
                const characters = [...line];
                const firstChar = characters[0];

                if (!firstChar) {
                    continue; // Skip empty lines
                }

                const index = setA.indexOf(firstChar);
                if (index >= 0) {
                    const newText = setA[(index + 1) % setA.length] + line.slice(firstChar.length);
                    builder.replace(selection, newText);
                } else {
                    const newText = setA[0] + ' ' + line;
                    builder.replace(selection, newText);
                }
            }
        });
        editor.selections = newSelections;
    }

    function updateTextVisibilityR(
        editor: vscode.TextEditor,
        isActive: boolean,
        decorationType: vscode.TextEditorDecorationType,
        dimRule: string) {
        const decorations: vscode.DecorationOptions[] = [];

        if (isActive && dimRule) {
            const regexPatterns = dimRule
                .split(':')
                .map(pattern => pattern.trim())
                .filter(Boolean)
                .flatMap(pattern => {
                    try {
                        return [new RegExp(pattern, 'g')];
                    } catch {
                        return [];
                    }
                });


            for (let lineNum = 0; lineNum < editor.document.lineCount; lineNum++) {
                const lineText = editor.document.lineAt(lineNum).text;

                regexPatterns.forEach(regex => {
                    let match: RegExpExecArray | null;
                    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
                    while ((match = globalRegex.exec(lineText)) !== null) {
                        const startPos = new vscode.Position(lineNum, match.index);
                        const endPos = new vscode.Position(lineNum, match.index + match[0].length);
                        decorations.push({ range: new vscode.Range(startPos, endPos) });
                    }
                });
            }
        }

        editor.setDecorations(decorationType, decorations);
    }






    function updateTextVisibility(
        editor: vscode.TextEditor,
        isActive: boolean,
        hideDecorationType: vscode.TextEditorDecorationType,
        dimRule: string
    ) {
        const decorationsArray: vscode.DecorationOptions[] = [];
        if (isActive && dimRule) {
            const regexPatterns = dimRule.split(':').map(s => s.trim()).filter(Boolean).map(pattern => new RegExp(pattern, 'g'));
            // dimRule can be e.g. '<pre:pre>' or any string for matching
            // For demo, split by ':' to allow multiple matchers, or just use as substring
            const matchers = dimRule.split(':').map(s => s.trim()).filter(Boolean);
            for (let i = 0; i < editor.document.lineCount; i++) {
                const line = editor.document.lineAt(i);
                const text = line.text;
                if (matchers.some(matcher => text.includes(matcher))) {
                    const range = new vscode.Range(i, 0, i, line.text.length);
                    decorationsArray.push({ range });
                }
            }
        }
        editor.setDecorations(hideDecorationType, decorationsArray);
    }
    const hideDecorationType = vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('descriptionForeground'),
        opacity: '0.45',
    });

    function getDimRule(editor: vscode.TextEditor): string {
        const definitions = vscode.workspace
            .getConfiguration('caser')
            .get<string[]>('dimmableMatches', []);
        const languagePrefix = editor.document.languageId + ':';
        const match = definitions.find(definition => definition.startsWith(languagePrefix));
        return match?.substring(languagePrefix.length) ?? '';
    }

    function refreshDimmedEditor(editor: vscode.TextEditor): void {
        updateTextVisibilityR(
            editor,
            isDimActive,
            hideDecorationType,
            getDimRule(editor)
        );
    }

    function refreshDimmedEditors(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            refreshDimmedEditor(editor);
        }
    }

    refreshDimmedEditors();
    context.subscriptions.push(
        hideDecorationType,
        vscode.window.onDidChangeVisibleTextEditors(refreshDimmedEditors),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('caser.dimActive')) {
                isDimActive = vscode.workspace
                    .getConfiguration('caser')
                    .get<boolean>('dimActive', true);
            }
            if (
                event.affectsConfiguration('caser.dimActive')
                || event.affectsConfiguration('caser.dimmableMatches')
            ) {
                refreshDimmedEditors();
            }
        })
    );

    const toDimmed = vscode.commands.registerCommand('caser.toDimmed', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        if (!getDimRule(editor)) {
            vscode.window.setStatusBarMessage('');
            return;
        }

        const nextState = !isDimActive;
        try {
            await vscode.workspace
                .getConfiguration('caser')
                .update('dimActive', nextState, vscode.ConfigurationTarget.Global);
            isDimActive = nextState;
            refreshDimmedEditors();
            vscode.window.setStatusBarMessage(`${isDimActive ? 'dim' : '==='}`);
        } catch (error) {
            vscode.window.showErrorMessage('Could not save the dimming state: ' + error);
        }
    });
    const toQuoted = vscode.commands.registerCommand('caser.toQuoted', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '"' + text + '"';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toUnQuoted = vscode.commands.registerCommand('caser.toUnQuoted', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = text.replace(/\"/g, '');
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toSQuoted = vscode.commands.registerCommand('caser.toSQuoted', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '\'' + text + '\'';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toBackTicked = vscode.commands.registerCommand('caser.toBackTicked', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '`' + text + '`';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toFile = vscode.commands.registerCommand('caser.toFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor is available.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder is open. Please open a folder or workspace.');
            return;
        }

        let filePath = toFilePath;
        if (!filePath) {
            const requestedPath = await vscode.window.showInputBox({
                prompt: 'Enter a filename or workspace-relative path',
                placeHolder: 'notes.md',
                validateInput: value => value.trim() ? undefined : 'Enter a filename.'
            });
            if (requestedPath === undefined) {
                return;
            }
            filePath = requestedPath.trim();
        }

        const document = editor.document;
        const selection = defaultToLineSelected(editor, editor.selection);
        const text = document.getText(selection);
        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

        try {
            let existingContent = '';
            try {
                const fileData = await vscode.workspace.fs.readFile(uri);
                existingContent = new TextDecoder().decode(fileData);
            } catch {
                // File does not exist, so it will be created.
            }

            await vscode.workspace.fs.writeFile(
                uri,
                new TextEncoder().encode(existingContent + text)
            );

            const removed = await editor.edit(builder => {
                builder.delete(selection);
            });
            if (!removed) {
                vscode.window.showWarningMessage(
                    `Content was appended to ${filePath}, but could not be removed from the editor.`
                );
            }

            toFilePath = filePath;
            const newDocument = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(newDocument);
            await newDocument.save();
        } catch (error) {
            vscode.window.showErrorMessage('Error writing file: ' + error);
        }
    });
    const saveToBucket = vscode.commands.registerCommand('caser.saveToBucket', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor is available to save.');
            return;
        }
        const targetUri = await bucketFolders.showSaveDialog();
        if (!targetUri) {
            return;
        }
        try {
            const contents = new TextEncoder().encode(editor.document.getText());
            await vscode.workspace.fs.writeFile(targetUri, contents);
            const savedDocument = await vscode.workspace.openTextDocument(targetUri);
            await vscode.window.showTextDocument(savedDocument, { preview: false });
            vscode.window.showInformationMessage(`Saved to ${targetUri.fsPath}`);
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to save file: ' + error);
        }
    });
    const loadFromBucket = vscode.commands.registerCommand('caser.loadFromBucket', async () => {
        const targetUri = await bucketFolders.showOpenDialog();
        if (!targetUri) {
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(targetUri);
            await vscode.window.showTextDocument(document, { preview: false });
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to load file: ' + error);
        }
    });
    const toUnBackTicked = vscode.commands.registerCommand('caser.toUnBackTicked', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = text.replace(/`/g, '');
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toCurly = vscode.commands.registerCommand('caser.toCurly', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '{' + text + '}';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toParens = vscode.commands.registerCommand('caser.toParens', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '(' + text + ')';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toSquare = vscode.commands.registerCommand('caser.toSquare', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, editor.selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '[' + text + ']';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toStarred = vscode.commands.registerCommand('caser.toStarred', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '*' + text + '*';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toIndent = vscode.commands.registerCommand('caser.toIndent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const lineNumbers = new Set<number>();
        for (const selection of editor.selections) {
            for (const lineNumber of selectionToLineNumbers(selection)) {
                lineNumbers.add(lineNumber);
            }
        }

        await editor.edit(builder => {
            for (const lineNumber of lineNumbers) {
                const line = document.lineAt(lineNumber);
                builder.replace(line.range, cycleMarkdownIndent(line.text));
            }
        });
    });
    const toLineComment = vscode.commands.registerCommand('caser.toLineComment', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const targetLineNumbers = new Set<number>();
        for (const selection of editor.selections) {
            for (const lineNumber of selectionToLineNumbers(selection)) {
                targetLineNumbers.add(lineNumber);
            }
        }

        const sortedLineNumbers = [...targetLineNumbers].sort((a, b) => a - b);
        if (sortedLineNumbers.length === 0) {
            return;
        }

        const firstLineText = document.lineAt(sortedLineNumbers[0]).text;
        const shouldUncomment = firstLineText.includes(specialLineCommentStart);
        const replacements = new Map<number, string>();

        if (shouldUncomment) {
            for (const lineNumber of sortedLineNumbers) {
                const lineText = document.lineAt(lineNumber).text;
                replacements.set(lineNumber, removeSpecialLineComments(lineText));
            }
        }
        else {
            let insideComment = false;
            for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
                const lineText = document.lineAt(lineNumber).text;
                const transformation = commentUncommentedLineSegments(lineText, insideComment);
                insideComment = transformation.endsInsideComment;
                if (targetLineNumbers.has(lineNumber)) {
                    replacements.set(lineNumber, transformation.text);
                }
            }
        }

        await editor.edit(builder => {
            for (const [lineNumber, replacement] of replacements) {
                const line = document.lineAt(lineNumber);
                if (replacement !== line.text) {
                    builder.replace(line.range, replacement);
                }
            }
        });
    });
    const toUnderScored = vscode.commands.registerCommand('caser.toUnderScored', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '_' + text + '_';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toTilded = vscode.commands.registerCommand('caser.toTilded', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '~' + text + '~';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });

    const toAngle = vscode.commands.registerCommand('caser.toAngle', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = '<' + text + '>';
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toNone = vscode.commands.registerCommand('caser.toNone', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = text.substring(1, text.length - 1);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toUnSQuoted = vscode.commands.registerCommand('caser.toUnSQuoted', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = text.replace(/\'/g, '');
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toCamelCase = vscode.commands.registerCommand('caser.toCamelCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = camelCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toSnakeCase = vscode.commands.registerCommand('caser.toSnakeCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = snakeCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toDos = vscode.commands.registerCommand('caser.toDos', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = DosSlash(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toUnix = vscode.commands.registerCommand('caser.toUnix', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = UnixSlash(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toKebabCase = vscode.commands.registerCommand('caser.toKebabCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = kebabCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toPascalCase = vscode.commands.registerCommand('caser.toPascalCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = pascallCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toTitleCase = vscode.commands.registerCommand('caser.toTitleCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            // defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = titleCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toOtherCase = vscode.commands.registerCommand('caser.toOtherCase', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            const adjustedSelections = selections.map(selection => defaultToOtherCaseSelected(editor, selection));
            const selectedTexts = adjustedSelections.map(selection => document.getText(selection));
            const sharedState = getSharedOtherCaseState(selectedTexts);
            editor.selections = adjustedSelections;

            await editor.edit(builder => {
                for (let index = 0; index < adjustedSelections.length; index++) {
                    const adjustedSelection = adjustedSelections[index];
                    const text = selectedTexts[index] ?? '';
                    const newText = toNextOtherCase(text, sharedState);
                    builder.replace(adjustedSelection, newText);
                }
            });

            editor.selections = adjustedSelections;
        }
    });
    const toSpaceCase = vscode.commands.registerCommand('caser.toSpaceCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            //defaultToLineSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    const newText = spaceCase(text);
                    builder.replace(adjustedSelection, newText);
                }
            });
        }
    });
    const toEscaped = vscode.commands.registerCommand('caser.toEscaped', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = escape(text);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toUnEscaped = vscode.commands.registerCommand('caser.toUnEscaped', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = unEscape(text);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const loremIpsum = vscode.commands.registerCommand('caser.loremIpsum', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = text + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam tincidunt metus in justo pretium congue. Donec lobortis nunc a sapien tempor, in luctus mi volutpat. Sed convallis lacus dolor, in iaculis purus pharetra id. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi a bibendum nisi. Aliquam augue urna, commodo a dui pharetra, suscipit laoreet mauris. Aliquam ac orci a neque dignissim hendrerit.';
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toNewLine = vscode.commands.registerCommand('caser.toNewLine', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            defaultToWordSelected(editor);
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = '\n' + text;
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toMultiple = vscode.commands.registerCommand('caser.toMultiple', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const seenRanges = new Set<string>();
        const plans: {
            range: vscode.Range;
            startOffset: number;
            oldLength: number;
            newText: string;
        }[] = [];

        for (const selection of editor.selections) {
            const range = defaultToLineSelected(editor, selection);
            const startOffset = document.offsetAt(range.start);
            const endOffset = document.offsetAt(range.end);
            const rangeKey = `${startOffset}:${endOffset}`;

            if (seenRanges.has(rangeKey)) {
                continue;
            }
            seenRanges.add(rangeKey);

            const text = document.getText(range);
            plans.push({
                range,
                startOffset,
                oldLength: endOffset - startOffset,
                newText: text + text
            });
        }

        plans.sort((left, right) => left.startOffset - right.startOffset);

        const finalOffsets: number[] = [];
        let cumulativeDelta = 0;
        for (const plan of plans) {
            finalOffsets.push(plan.startOffset + cumulativeDelta + plan.newText.length);
            cumulativeDelta += plan.newText.length - plan.oldLength;
        }

        const success = await editor.edit(builder => {
            for (const plan of plans) {
                builder.replace(plan.range, plan.newText);
            }
        });

        if (!success) {
            return;
        }

        editor.selections = finalOffsets.map(finalOffset => {
            const textEnd = document.positionAt(finalOffset);
            const lineEnd = document.lineAt(textEnd.line).range.end;
            return new vscode.Selection(lineEnd, lineEnd);
        });
    });
    const toClear = vscode.commands.registerCommand('caser.toClear', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = clear(text);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toSecure = vscode.commands.registerCommand('caser.toSecure', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = secure(text);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toFlip = vscode.commands.registerCommand('caser.toFlip', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            FindMarked(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = flip(text);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toCompact = vscode.commands.registerCommand('caser.toCompact', () => {
        const editor = vscode.window.activeTextEditor;
        //defaultToLineSelected(editor);
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = stripWhiteSpace(document.getText(adjustedSelection));
                    builder.replace(adjustedSelection, text);
                }
            });
        }
    });
    const toSwap = vscode.commands.registerCommand('caser.toSwap', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            if (selections.length === 2) {
                const text1 = document.getText(selections[0]);
                const text2 = document.getText(selections[1]);

                editor.edit(builder => {
                    builder.replace(selections[0], text2);
                    builder.replace(selections[1], text1);
                });
            }
            else {
                if (selections.length === 1 && selections[0].isEmpty) {
                    const line = document.lineAt(selections[0].start.line);
                    const text = line.text;
                    const cursorCharacter = selections[0].start.character;
                    const characterBeforeCursor = text.charAt(cursorCharacter - 1);
                    const characterAfterCursor = text.charAt(cursorCharacter);

                    if (characterBeforeCursor !== ''
                        && characterAfterCursor !== ''
                        && /\S/.test(characterBeforeCursor)
                        && /\S/.test(characterAfterCursor)) {
                        const rangeBeforeCursor = new vscode.Range(
                            selections[0].start.translate(0, -1),
                            selections[0].start
                        );
                        const rangeAfterCursor = new vscode.Range(
                            selections[0].start,
                            selections[0].start.translate(0, 1)
                        );

                        editor.edit(builder => {
                            builder.replace(rangeBeforeCursor, characterAfterCursor);
                            builder.replace(rangeAfterCursor, characterBeforeCursor);
                        });
                    }
                    else if (characterAfterCursor === ' '
                        || characterBeforeCursor === ' ') {
                        // get the word after the space
                        const range1 = document.getWordRangeAtPosition(selections[0].start.translate(0, 1));
                        const range2 = document.getWordRangeAtPosition(selections[0].start.translate(0, -1));
                        // get the text offrom range 1 and range 2
                        if (range1 && range2) {
                            const word1 = document.getText(range1);
                            const word2 = document.getText(range2);

                            editor.edit(builder => {
                                builder.replace(range1, word2);
                                builder.replace(range2, word1);
                            });
                        }
                    }
                }
                else if (selections.length === 1 && !selections[0].isEmpty) {
                    const text = document.getText(selections[0]);
                    if (selections[0].start.character > 1) {
                        const range1 = document.getWordRangeAtPosition(selections[0].end.translate(0, 1));
                        const range2 = document.getWordRangeAtPosition(selections[0].start.translate(0, -1));
                        if (range1 && range2) {
                            const text1 = document.getText(range1);
                            const text2 = document.getText(range2);
                            if (text1 === text2) { // we are in the middle of a word!
                                //exchange the portin of the word before the selectin with that after the selection
                                const rangeL = new vscode.Range(range1.start, selections[0].start);
                                const rangeR = new vscode.Range(selections[0].end, range2.end);
                                const textL = document.getText(rangeL);
                                const textR = document.getText(rangeR);
                                editor.edit(builder => {
                                    builder.replace(rangeL, textR);
                                    builder.replace(rangeR, textL);
                                });
                            }
                            editor.edit(builder => {
                                builder.replace(range1, text2);
                                builder.replace(range2, text1);
                            });
                            //editor.selections = [new vscode.Selection(range1.start, range2.end)];
                        }
                    }
                }
            }
        }
    });
    const markQuery = vscode.commands.registerCommand('caser.markQuery', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', ["🟥", "🟨", "🟩", "🟦", "✅", "❎"]);
        const setB = config.get<string[]>('dotIcons', ["🔴", "🟡", "🟢", "🔵", "✔️", "✖️"]);
        const setC = config.get<string[]>('stepIcons', ["💭", "🔎", "👋", "💡", "🚧", "🎁"]);
        const setD = config.get<string[]>('queryIcons', ["❓", "⁉️", "❌", "❗", "‼️", "🛑"]);
        const setAll = [...setA, ...setB, ...setC, ...setD];
        if (editor) {
            const document = editor.document;
            await applyLineMarking(editor, selection => {
                const text = document.getText(selection);
                return ComputeSymbolReplacement(text, setD, setAll);
            });
        }
    });
    const selectByRegex = vscode.commands.registerCommand('caser.selectByRegex', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            var selections = [...editor.selections];
            // if no selections, select the whole document
            if (selections.length === 0) {
                selections.push(new vscode.Selection(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length));
            }
            var newSelections: vscode.Selection[] = [];
            // read the regexOptins from the caser settings
            const config = vscode.workspace.getConfiguration('caser');

            const regexOptions = config.get<{ label: string; description: string }[]>('regexOptions')
                ||  // Default regex options         
                [
                    { label: '\\b\\w+\\b', description: 'Match words' },
                    { label: '\\d+', description: 'Match numbers' },
                    { label: '[A-Z][a-z]+', description: 'Match capitalized words' },
                    { label: '\\s+', description: 'Match whitespace' },
                    { label: '\\w+@\\w+\\.\\w+', description: 'Match email addresses' }
                ];

            const selectedRegex = await vscode.window.showQuickPick(
                regexOptions.map(option => ({
                    label: option.label,
                    description: option.description
                })),
                { placeHolder: 'Select a regex or type your own' }
            );
            const regex = selectedRegex?.label
                ? await vscode.window.showInputBox({
                    prompt: 'Edit the regex or press Enter to use the selected value',
                    value: selectedRegex.label // Pre-fill with the selected value
                })
                : await vscode.window.showInputBox({ prompt: 'Enter a custom regex' });

            if (regex) {
                const regexObj = new RegExp(regex, 'g');

                for (const selection of selections) {
                    const text = document.getText(selection);
                    const matches = text.matchAll(regexObj);

                    if (matches) {
                        for (const match of matches) {
                            const matchStartIndex = match.index ?? 0;
                            const matchLength = match[0].length;
                            const start = document.positionAt(document.offsetAt(selection.start) + matchStartIndex);
                            const end = start.translate(0, matchLength);

                            newSelections.push(new vscode.Selection(start, end));
                        }
                    }
                }
                editor.selections = newSelections;
            }
        }
    });
    const markLine = vscode.commands.registerCommand('caser.markLine', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', ["🟥", "🟨", "🟩", "🟦", "✅", "❎"]);
        const setB = config.get<string[]>('dotIcons', ["🔴", "🟡", "🟢", "🔵", "✔️", "✖️"]);
        const setC = config.get<string[]>('stepIcons', ["💭", "🔎", "👋", "💡", "🚧", "🎁"]);
        const setD = config.get<string[]>('queryIcons', ["❓", "⁉️", "❌", "❗", "‼️", "🛑"]);
        const setAll = [...setA, ...setB, ...setC, ...setD];
        if (editor) {
            const document = editor.document;
            await applyLineMarking(editor, selection => {
                const line = document.getText(selection);
                const fullLine = document.lineAt(selection.start.line).text;
                const isHeading = fullLine.startsWith('#');
                return isHeading
                    ? ComputeSymbolReplacement(line, setA, setAll)
                    : ComputeSymbolReplacement(line, setB, setAll);
            });
        }
    });
    const markNumber = vscode.commands.registerCommand('caser.markNumber', async () => {
        const editor = vscode.window.activeTextEditor;
        //const config = vscode.workspace.getConfiguration('caser');
        const setN = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        if (editor) {
            atStartSpaced(editor); //AdjustSelectionsForPrefix(editor);
            await doSymbolsInPlace(editor, setN, setN);
            //atEndSpaced(editor);
        }
    });
    const markWarn = vscode.commands.registerCommand('caser.markWarn', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('warnIcons', ["📌", "💥", "⚠️", "🪲", "🩹", "⏳"]);
        if (editor) {
            const document = editor.document;
            await applyLineMarking(editor, selection => {
                const text = document.getText(selection);
                return ComputeSymbolReplacement(text, setA, setA);
            });
        }
    });
    const markUser = vscode.commands.registerCommand('caser.markUser', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('userIcons', ["👬", "😁", "😞", "☘️", "🕊️", "🎗️"]);
        if (editor) {
            const document = editor.document;
            await applyLineMarking(editor, selection => {
                const text = document.getText(selection);
                return ComputeSymbolReplacement(text, setA, setA);
            });
        }
    });
    const markRef = vscode.commands.registerCommand('caser.markRef', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('refIcons', ["🎟️", "🔀", "⚗️", "📚", "📆", "🔒"]);
        if (editor) {
            await doSymbolsInPlace(editor, setA, setA);
        }
    });
    const markStep = vscode.commands.registerCommand('caser.markStep', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', ["🟥", "🟨", "🟩", "🟦", "✅", "❎"]);
        const setB = config.get<string[]>('dotIcons', ["🔴", "🟡", "🟢", "🔵", "✔️", "✖️"]);
        const setC = config.get<string[]>('stepIcons', ["💭", "🔎", "👋", "💡", "🚧", "🎁"]);
        const setD = config.get<string[]>('queryIcons', ["❓", "⁉️", "❌", "❗", "‼️", "🛑"]);
        const setAll = [...setA, ...setB, ...setC, ...setD];
        if (editor) {
            const document = editor.document;
            await applyLineMarking(editor, selection => {
                const text = document.getText(selection);
                return ComputeSymbolReplacement(text, setC, setAll);
            });
        }
    });
    const markLink = vscode.commands.registerCommand('caser.markLink', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('linkIcons', ["[🔗]()", "[🔖](#)", "[🎟️]()", "[🔀]()", "[📚]()", "[⏪]()", "[⏩]()"]);
        if (editor) {
            const document = editor.document;
            const templates = setA.map(parseLinkTemplate);
            const clipboardText = await vscode.env.clipboard.readText();
            const selections = [...editor.selections];
            const plans = selections.map((selection, index) => {
                const existingLink = findMarkedLinkMatch(editor, selection, templates);
                if (existingLink) {
                    const nextTemplate = cycleLinkTemplate(templates, existingLink.symbol);
                    const nextTarget = existingLink.target || buildLinkTarget(nextTemplate, clipboardText);
                    return {
                        index,
                        range: existingLink.range,
                        startOffset: document.offsetAt(existingLink.range.start),
                        oldLength: document.getText(existingLink.range).length,
                        symbol: nextTemplate.symbol,
                        label: existingLink.label,
                        newText: buildMarkedLink(nextTemplate, existingLink.label, nextTarget)
                    };
                }

                const label = normalizeInlineText(document.getText(selection));
                const template = templates[0];
                return {
                    index,
                    range: selection,
                    startOffset: document.offsetAt(selection.start),
                    oldLength: document.getText(selection).length,
                    symbol: template.symbol,
                    label,
                    newText: buildMarkedLink(template, label, buildLinkTarget(template, clipboardText))
                };
            }).sort((left, right) => left.startOffset - right.startOffset);

            let cumulativeDelta = 0;
            const finalTitleOffsets = new Map<number, { start: number; end: number }>();
            for (const plan of plans) {
                const linkStartOffset = plan.startOffset + cumulativeDelta;
                const titleStartOffset = linkStartOffset + 1 + plan.symbol.length + 1;
                finalTitleOffsets.set(plan.index, {
                    start: titleStartOffset,
                    end: titleStartOffset + plan.label.length
                });
                cumulativeDelta += plan.newText.length - plan.oldLength;
            }

            await editor.edit(builder => {
                for (const plan of plans) {
                    builder.replace(plan.range, plan.newText);
                }
            });

            editor.selections = selections.map((_, index) => {
                const titleOffsets = finalTitleOffsets.get(index);
                if (!titleOffsets) {
                    const position = editor.document.positionAt(document.offsetAt(selections[index].end));
                    return new vscode.Selection(position, position);
                }
                return new vscode.Selection(
                    editor.document.positionAt(titleOffsets.start),
                    editor.document.positionAt(titleOffsets.end)
                );
            });
        }
    });
    const markNone = vscode.commands.registerCommand('caser.markNone', () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', []);
        setA.push(...config.get<string[]>('dotIcons', []));
        setA.push(...config.get<string[]>('queryIcons', []));
        setA.push(...config.get<string[]>('stepIcons', []));
        setA.push(...config.get<string[]>('numberIcons', []));
        setA.push(...config.get<string[]>('tagIcons', []));
        setA.push(...config.get<string[]>('flagIcons', []));
        setA.push(...config.get<string[]>('circleIcons', []));
        if (editor) {
            RemoveSymbols(editor, setA);
        }
    });
    const toEnd = vscode.commands.registerCommand('caser.toEnd', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {

            // Move the selected text to the end of the document
            const document = editor.document;
            const selections = editor.selections;
            // if the selection starts with a heading make a link to the heading first
            var replacement = '';
            const heading = document.lineAt(selections[0].start.line).text;
            const config = vscode.workspace.getConfiguration('caser');
            const charSet = config.get<string[]>('squareIcons', ['🟥', '🟨', '🟩', '🟦', '✅', '❎']);
            const charSetRegex = new RegExp(`[${charSet.join('')}]`, 'g');

            if (heading.startsWith('#')) {
                replacement = '[🔖](#' + heading
                    .replace(/#+\s*/g, '',)
                    .replace(charSetRegex, '')
                    .trim()
                    .replace(/[ \t]+/g, '-')
                    + ')';
            }
            var ix = 0;
            editor.edit(builder => {
                for (const selection of selections) {
                    var text = document.getText(selection);
                    if (ix++ === 0) {
                        text = text.replace(charSetRegex, '');
                    }                    // add text to end of document
                    const end = document.lineAt(document.lineCount - 1).range.end;
                    const newText = '\n' + text;
                    builder.insert(end, newText);
                    // remove the selected text
                    builder.replace(selection, replacement);
                    replacement = '';
                }
            });
        }
    });
    const toNextEnd = vscode.commands.registerCommand('caser.toNextEnd', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        editor.selections = editor.selections.map(selection => {
            const currentLine = document.lineAt(selection.active.line);
            const targetLineNumber = selection.active.character === currentLine.range.end.character
                ? Math.min(selection.active.line + 1, document.lineCount - 1)
                : selection.active.line;
            const target = document.lineAt(targetLineNumber).range.end;
            return new vscode.Selection(target, target);
        });
    });
    const toFence = vscode.commands.registerCommand('caser.toFence', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const defaultFenceTypes = ['cs', 'json', 'sql', 'ps', 'yaml', 'html', 'css', 'mermaid'];
        const configuredFenceTypes = vscode.workspace.getConfiguration('caser')
            .get<string[]>('fences', defaultFenceTypes)
            .map(fenceType => fenceType.trim())
            .filter(fenceType => fenceType.length > 0);
        const fenceTypes = configuredFenceTypes.length > 0 ? configuredFenceTypes : defaultFenceTypes;
        const document = editor.document;
        const selection = editor.selection;
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const fenceLinePattern = /^([ \t]*)```([^`\s]*)[ \t]*$/;
        const nextFenceType = (currentFenceType: string): string => {
            const currentIndex = fenceTypes.indexOf(currentFenceType);
            return currentIndex === -1 ? fenceTypes[0] : fenceTypes[(currentIndex + 1) % fenceTypes.length];
        };

        if (!selection.isEmpty) {
            const selectedText = document.getText(selection);
            const openingLineText = selectedText.split(/\r?\n/, 1)[0];
            const openingFence = openingLineText.match(fenceLinePattern);

            if (openingFence) {
                const replacement = `${openingFence[1]}\`\`\`${nextFenceType(openingFence[2])}`;
                const selectionStartOffset = document.offsetAt(selection.start);
                const selectionEndOffset = document.offsetAt(selection.end);
                const openingRange = new vscode.Range(
                    selection.start,
                    document.positionAt(selectionStartOffset + openingLineText.length)
                );
                const delta = replacement.length - openingLineText.length;

                await editor.edit(builder => builder.replace(openingRange, replacement));
                editor.selection = new vscode.Selection(
                    editor.document.positionAt(selectionStartOffset),
                    editor.document.positionAt(selectionEndOffset + delta)
                );
                return;
            }

            const opening = `\`\`\`${fenceTypes[0]}${eol}`;
            const closingPrefix = selectedText.endsWith('\n') ? '' : eol;
            const replacement = opening + selectedText + closingPrefix + '```';
            const selectionStartOffset = document.offsetAt(selection.start);

            await editor.edit(builder => builder.replace(selection, replacement));
            editor.selection = new vscode.Selection(
                editor.document.positionAt(selectionStartOffset + opening.length),
                editor.document.positionAt(selectionStartOffset + opening.length + selectedText.length)
            );
            return;
        }

        const currentLineNumber = selection.active.line;
        const currentFence = document.lineAt(currentLineNumber).text.match(fenceLinePattern);
        if (currentFence) {
            let unmatchedOpeningLine: number | undefined;
            for (let lineNumber = 0; lineNumber < currentLineNumber; lineNumber++) {
                if (!fenceLinePattern.test(document.lineAt(lineNumber).text)) {
                    continue;
                }
                unmatchedOpeningLine = unmatchedOpeningLine === undefined ? lineNumber : undefined;
            }

            const targetLineNumber = currentFence[2] === '' && unmatchedOpeningLine !== undefined
                ? unmatchedOpeningLine
                : currentLineNumber;
            const targetLine = document.lineAt(targetLineNumber);
            const targetFence = targetLine.text.match(fenceLinePattern);
            if (!targetFence) {
                return;
            }

            const replacement = `${targetFence[1]}\`\`\`${nextFenceType(targetFence[2])}`;
            const originalCursor = selection.active;
            await editor.edit(builder => builder.replace(targetLine.range, replacement));
            const target = targetLineNumber === currentLineNumber
                ? editor.document.lineAt(targetLineNumber).range.end
                : originalCursor;
            editor.selection = new vscode.Selection(target, target);
            return;
        }

        const line = document.lineAt(selection.active.line);
        const leadingEol = selection.active.character === 0 ? '' : eol;
        const trailingEol = selection.active.character === line.text.length ? '' : eol;
        const opening = `\`\`\`${fenceTypes[0]}${eol}`;
        const replacement = leadingEol + opening + eol + '```' + trailingEol;
        const insertionOffset = document.offsetAt(selection.active);
        const contentOffset = insertionOffset + leadingEol.length + opening.length;

        await editor.edit(builder => builder.insert(selection.active, replacement));
        const contentPosition = editor.document.positionAt(contentOffset);
        editor.selection = new vscode.Selection(contentPosition, contentPosition);
    });
    const toPrefixList = vscode.commands.registerCommand('caser.toPrefixList', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            var atLine = selection.start.line;
            editor.edit(builder => {
                const startLine = selection.start.line;
                const text = document.getText(selection);
                const line = document.lineAt(selection.start.line);
                const lineText = line.text;
                const leader = lineText.substring(0, lineText.indexOf(lineText.trimStart()));
                const lines = text.split(',');
                const newText =
                    leader + ' ' + lines[0].trim() + '\n'
                    + lines.slice(1).map(line => leader + ',' + line.trim()).join('\n');
                builder.replace(selection, newText);
                atLine += lines.length;
            });
            const end = document.lineAt(atLine).range.end;
            editor.selection = new vscode.Selection(selection.start, end);
            SelectAllAtLeft(editor);
        }
    });
    const toOrder = vscode.commands.registerCommand('caser.toOrder', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const newline = document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';
            editor.edit(builder => {
                for (const selection of editor.selections) {
                    const startLine = selection.start.line;
                    const endLine = selection.end.line;
                    const range = new vscode.Selection(
                        document.lineAt(startLine).range.start,
                        document.lineAt(endLine).range.end
                    );
                    const text = document.getText(range);
                    if (!text.length) {
                        continue;
                    }
                    const lines = text.split(/\r?\n/);
                    lines.sort((a, b) => a.localeCompare(b));
                    const newText = lines.join(newline);
                    builder.replace(range, newText);
                }
            });
        }
    });
    const toSuffixList = vscode.commands.registerCommand('caser.toSuffixList', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            var atLine = selection.start.line;
            editor.edit(builder => {
                const text = document.getText(selection);
                const line = document.lineAt(selection.start.line);
                const lineText = line.text;
                const leader = lineText.substring(0, lineText.indexOf(lineText.trimStart()));
                const lines = text.split(',');
                const newText =
                    lines.slice(0, -1).map(line => leader + line.trim() + ',').join('\n')
                    + '\n' + leader + lines[lines.length - 1].trim();
                builder.replace(selection, newText);
                atLine += lines.length;
            });
            const end = document.lineAt(atLine).range.end;
            editor.selection = new vscode.Selection(selection.start, end);
            SelectAllAtLeft(editor);
        }
    });
    const toNumbered = vscode.commands.registerCommand('caser.toNumbered', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            NumericSequence(editor, editor.selections);
        }
    });
    const toTogglePipeComma = vscode.commands.registerCommand('caser.toTogglePipeComma', () => {
        const editor = vscode.window.activeTextEditor;
        // see if a pipe or comma appears first
        // if so, replace all pipes with commas and vice versa
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            if (selections.length === 0) {
                return;
            }
            const firstSelection = selections[0];
            const firstLine = document.lineAt(firstSelection.start.line);
            const firstLineText = document.getText(firstLine.range);
            const ixComma = firstLineText.indexOf(',');
            const ixPipe = firstLineText.indexOf('|');
            var source = ' ';
            var target = ' ';
            if (ixComma === -1 || (ixPipe > -1 && ixPipe < ixComma)) {
                // pipe comes first
                source = '|';
                target = ',';
            } else {
                source = ',';
                target = '|';
            }
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const newText = text.replaceAll(source, target);
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const csvToMarkdownTable = vscode.commands.registerCommand('caser.csvToMarkdownTable', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;

            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

                    if (lines.length === 0) {
                        return;
                    }

                    // Detect if input is already a markdown table (contains pipes)
                    const isMarkdownTable = lines[0].includes('|');
                    let rows: string[][];

                    if (isMarkdownTable) {
                        // Parse markdown table rows
                        rows = [];
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            // Check if this is a separator row (contains only |, -, and spaces)
                            if (/^\|[\s\-|]+\|$/.test(line)) {
                                continue; // Skip separator row
                            }
                            // Split by pipes and trim, removing first and last empty elements
                            const cells = line.split('|').map((cell: string) => cell.trim()).filter((cell: string, idx: number, arr: string[]) => {
                                // Remove first and last elements if they're empty (from leading/trailing pipes)
                                return !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === '');
                            });
                            rows.push(cells);
                        }
                    } else {
                        // Parse CSV rows
                        rows = lines.map((line: string) => {
                            return line.split(',').map((cell: string) => cell.trim());
                        });
                    }

                    // Calculate column widths
                    const columnWidths: number[] = [];
                    for (const row of rows) {
                        for (let i = 0; i < row.length; i++) {
                            if (!columnWidths[i]) {
                                columnWidths[i] = 0;
                            }
                            columnWidths[i] = Math.max(columnWidths[i], row[i].length);
                        }
                    }

                    // Build markdown table
                    const markdownLines: string[] = [];
                    const isSingleRow = rows.length === 1 && !isMarkdownTable;

                    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                        const row = rows[rowIndex];
                        const paddedCells = row.map((cell, i) => {
                            return cell.padEnd(columnWidths[i], ' ');
                        });
                        markdownLines.push('| ' + paddedCells.join(' | ') + ' |');

                        // Add separator after first row (header) unless it's a single CSV row
                        if (rowIndex === 0 && !isSingleRow) {
                            const separators = columnWidths.map(width => '-'.repeat(width));
                            markdownLines.push('| ' + separators.join(' | ') + ' |');
                        }
                    }

                    const newText = markdownLines.join('\n');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toTree = vscode.commands.registerCommand('caser.toTree', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;

            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    const lines = text.split('\n');

                    if (lines.length === 0) {
                        return;
                    }

                    // Detect indentation pattern and parse lines
                    interface LineInfo {
                        level: number;
                        content: string;
                        originalLine: string;
                    }

                    const parsedLines: LineInfo[] = [];
                    let indentPattern: string | null = null;
                    let previousLevel = 0;

                    // First pass: detect indent pattern from first indented line
                    for (const line of lines) {
                        if (line.trim().length === 0) {
                            continue;
                        }

                        // Look for leading characters (space, multiple spaces, or any other char)
                        const leadingMatch = line.match(/^([ ]{1,2}|[^ ])/);
                        if (leadingMatch && indentPattern === null) {
                            // Found first indented line
                            indentPattern = leadingMatch[1];
                            break;
                        }
                    }

                    // If no indent pattern found, default to single space
                    if (indentPattern === null) {
                        indentPattern = ' ';
                    }

                    // Second pass: parse all lines
                    for (const line of lines) {
                        if (line.trim().length === 0) {
                            continue;
                        }

                        // Count how many times indent pattern appears at start
                        let level = 0;
                        let remainingLine = line;

                        // Keep removing indent pattern from start
                        while (remainingLine.startsWith(indentPattern)) {
                            level++;
                            remainingLine = remainingLine.substring(indentPattern.length);
                        }

                        // Remove optional space after last indent marker
                        if (remainingLine.startsWith(' ')) {
                            remainingLine = remainingLine.substring(1);
                        }

                        const content = remainingLine.trim();

                        // Clamp level to only increase by 1 at a time (but can decrease by any amount)
                        if (level > previousLevel + 1) {
                            level = previousLevel + 1;
                        }

                        parsedLines.push({
                            level,
                            content,
                            originalLine: line
                        });

                        previousLevel = level;
                    }

                    // Build tree structure
                    const treeLines: string[] = [];

                    for (let i = 0; i < parsedLines.length; i++) {
                        const current = parsedLines[i];
                        let prefix = '';

                        // Build prefix based on hierarchy
                        for (let level = 1; level < current.level; level++) {
                            // Check if this ancestor level has more items after current line
                            let hasMoreAtLevel = false;
                            for (let j = i + 1; j < parsedLines.length; j++) {
                                if (parsedLines[j].level <= level) {
                                    if (parsedLines[j].level === level) {
                                        hasMoreAtLevel = true;
                                    }
                                    break;
                                }
                            }

                            if (hasMoreAtLevel) {
                                prefix += '│  ';
                            } else {
                                prefix += '   ';
                            }
                        }

                        // Determine branch character for current level
                        if (current.level > 0) {
                            // Check if this is the last item at this level
                            let isLast = true;
                            for (let j = i + 1; j < parsedLines.length; j++) {
                                if (parsedLines[j].level <= current.level) {
                                    if (parsedLines[j].level === current.level) {
                                        isLast = false;
                                    }
                                    break;
                                }
                            }

                            prefix += isLast ? '└─ ' : '├─ ';
                        }

                        treeLines.push(prefix + current.content);
                    }

                    const newText = treeLines.join('\n');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toAnchor = vscode.commands.registerCommand('caser.toAnchor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor is available.');
            return;
        }

        const document = editor.document;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (document.isUntitled || !workspaceFolder) {
            vscode.window.showErrorMessage(
                'Save the document inside the current workspace before creating an anchor.'
            );
            return;
        }

        const targetLineIndex = editor.selection.active.line;
        const targetCharacter = editor.selection.active.character;
        const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
        const anchorDetails = buildAnchorDetails(relativePath, targetLineIndex);
        const newline = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const targetLine = document.lineAt(targetLineIndex);

        const inserted = await editor.edit(builder => {
            builder.insert(targetLine.range.start, anchorDetails.anchor + newline);
        });
        if (!inserted) {
            vscode.window.showErrorMessage('Could not insert the anchor.');
            return;
        }

        await vscode.env.clipboard.writeText(anchorDetails.bookmarkLink);

        const targetPosition = new vscode.Position(targetLineIndex + 1, targetCharacter);
        editor.selection = new vscode.Selection(targetPosition, targetPosition);
    });
    const toHeader = vscode.commands.registerCommand('caser.toHeader', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;

            editor.edit(builder => {
                for (const selection of selections) {
                    const startLine = selection.start.line;
                    const endLine = selection.end.line;

                    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
                        const line = document.lineAt(lineNum);
                        const lineText = line.text;

                        // Check if line starts with markdown header
                        const headerMatch = lineText.match(/^(#{1,5})\s+(.*)$/);

                        let newText: string;

                        if (headerMatch) {
                            const currentLevel = headerMatch[1].length;
                            const content = headerMatch[2];

                            if (currentLevel >= 5) {
                                // At max level, remove header
                                newText = content;
                            } else {
                                // Increment header level
                                newText = '#'.repeat(currentLevel + 1) + ' ' + content;
                            }
                        } else {
                            // No header, add level 1
                            const trimmedText = lineText.trim();
                            if (trimmedText.length > 0) {
                                const leadingWhitespace = lineText.match(/^(\s*)/)?.[1] || '';
                                newText = leadingWhitespace + '# ' + trimmedText;
                            } else {
                                newText = lineText;
                            }
                        }

                        builder.replace(line.range, newText);
                    }
                }
            });
        }
    });
    const toContinue = vscode.commands.registerCommand('caser.toContinue', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            const currentLine = document.lineAt(selection.active.line);
            const lineText = currentLine.text;

            // Detect prefix pattern: leading whitespace + optional list marker/symbol
            let prefix = '';

            // First, capture leading whitespace
            const leadingWhitespaceMatch = lineText.match(/^(\s*)/);
            const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '';

            // Look for common list markers after whitespace
            const afterWhitespace = lineText.substring(leadingWhitespace.length);

            // Check for various list patterns
            const listPatterns = [
                /^([-+*•◦▪▫›»] )/,           // Bullet points with space
                /^(\d+\.\s)/,                   // Numbered lists (1. 2. etc.)
                /^([a-z]\.\s)/,                 // Letter lists (a. b. etc.)
                /^([A-Z]\.\s)/,                 // Capital letter lists (A. B. etc.)
                /^(\d+\)\s)/,                   // Numbered with paren (1) 2) etc.)
                /^([\u2022-\u2043]\s)/,         // Various bullet unicode range
                /^([\u2190-\u21FF]\s)/,         // Arrow symbols
                /^([\u2600-\u26FF]\s)/,         // Misc symbols
                /^([\u2700-\u27BF]\s)/,         // Dingbats
                /^([\u1F300-\u1F9FF]\s)/,       // Emoji range (basic)
                /^([\p{Emoji_Presentation}]\s)/u, // Unicode emoji
                /^([^\w\s]\s)/,                 // Any non-word, non-space char followed by space
            ];

            let marker = '';
            for (const pattern of listPatterns) {
                const match = afterWhitespace.match(pattern);
                if (match) {
                    marker = match[1];
                    break;
                }
            }

            // Build the full prefix
            prefix = leadingWhitespace + marker;

            // Handle numbered lists - increment the number if detected
            const numberedMatch = marker.match(/^(\d+)([\.\)])\s$/);
            if (numberedMatch) {
                const nextNumber = parseInt(numberedMatch[1]) + 1;
                const separator = numberedMatch[2];
                marker = `${nextNumber}${separator} `;
                prefix = leadingWhitespace + marker;
            }

            // Insert new line with prefix
            editor.edit(builder => {
                const lineEnd = currentLine.range.end;
                builder.insert(lineEnd, '\n' + prefix);
            }).then(() => {
                // Move cursor to end of new line (after prefix)
                const newLine = selection.active.line + 1;
                const newPosition = new vscode.Position(newLine, prefix.length);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
        }
    });
    const toDitto = vscode.commands.registerCommand('caser.toDitto', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;

        // Get exact cursor position (collapse any selection to cursor)
        const cursorPos = editor.selection.active;
        const lineNum = cursorPos.line;
        const colNum = cursorPos.character;

        // Can't ditto if on first line
        if (lineNum === 0) {
            return;
        }

        // Get line above
        const lineAbove = document.lineAt(lineNum - 1);
        const aboveText = lineAbove.text;

        // If line above is too short at this column, nothing to copy
        if (colNum >= aboveText.length) {
            return;
        }

        // Get text from line above starting at cursor's column position
        const textFromAbove = aboveText.substring(colNum);

        if (textFromAbove.length === 0) {
            return;
        }

        // Match: [leading spaces] + [word/punctuation] + [optional trailing space]
        const wordMatch = textFromAbove.match(/^(\s*\S+\s?)/);

        if (!wordMatch) {
            return;
        }

        const textToCopy = wordMatch[1];

        // Create exact position for insertion
        const insertPos = new vscode.Position(lineNum, colNum);

        // ONLY INSERT - do not delete or replace anything
        editor.edit(builder => {
            builder.insert(insertPos, textToCopy);
        }, {
            undoStopBefore: true,
            undoStopAfter: true
        }).then(success => {
            if (success) {
                // Move cursor to end of inserted text
                const newPos = new vscode.Position(lineNum, colNum + textToCopy.length);
                editor.selection = new vscode.Selection(newPos, newPos);
            }
        });
    });
    const toPad = vscode.commands.registerCommand('caser.toPad', () => {
        const editor = vscode.window.activeTextEditor;
        // for each selection
        // find the longest line
        // pad all lines to the length of the longest line
        // replace the line with the padded
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            const newSelections: vscode.Selection[] = [];

            for (const selection of selections) {
                const startLine = selection.start.line;
                const endLine = selection.end.line;
                for (let line = startLine; line <= endLine; line++) {
                    const lineRange = document.lineAt(line).range;
                    newSelections.push(new vscode.Selection(lineRange.start, lineRange.end));
                }
            }
            editor.selections = newSelections; // Update the editor with the new selections
            var maxLength = 0;
            for (const selection of newSelections) {
                const line = document.getText(selection);
                maxLength = Math.max(line.length, maxLength);
            }
            editor
                .edit(builder => {
                    for (const selection of newSelections) {
                        const line = document.getText(selection);
                        const padded = line.padEnd(maxLength);
                        builder.replace(selection, padded);
                    }
                }
                );
        }
    }
    );
    const toTrim = vscode.commands.registerCommand('caser.toTrim', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            const newSelections: vscode.Selection[] = [];
            // remove spaces from the end of each line in the selection
            for (const selection of selections) {
                const startLine = selection.start.line;
                const endLine = selection.end.line;
                for (let line = startLine; line <= endLine; line++) {
                    const lineRange = document.lineAt(line).range;
                    newSelections.push(new vscode.Selection(lineRange.start, lineRange.end));
                }
            }
            editor.selections = newSelections; // Update the editor with the new selections
            editor.edit(builder => {
                for (const selection of newSelections) {
                    const line = document.getText(selection);
                    const trimmed = line.trimEnd();
                    builder.replace(selection, trimmed);
                }
            });

        }
    }
    );
    const toTest = vscode.commands.registerCommand('caser.toTest', () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setX = config.get<string[]>('numberIcons', ["1", "2", "3", "4", "5", "6"]);
        if (editor) {
            editor.selections = [selectSymbol(editor, editor.selection, setX)];
            //AdjustSelectionsForPrefix(editor);
            //doSymbolsInPlace(editor, setX, []);
        }
    });
    const toNoSquare = vscode.commands.registerCommand('caser.toNoSquare', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = editor.document.getText(selection);
                    const newText = text.replaceAll('[', '').replaceAll(']', '');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toNoParens = vscode.commands.registerCommand('caser.toNoParens', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = editor.document.getText(selection);
                    const newText = text.replaceAll('(', '').replaceAll(')', '');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toNoCurly = vscode.commands.registerCommand('caser.toNoCurly', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = editor.document.getText(selection);
                    const newText = text.replaceAll('{', '').replaceAll('}', '');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toNoAngle = vscode.commands.registerCommand('caser.toNoAngle', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = editor.document.getText(selection);
                    const newText = text.replaceAll('<', '').replaceAll('>', '');
                    builder.replace(selection, newText);
                }
            });
        }
    });
    const toMath = vscode.commands.registerCommand('caser.toMath', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            var text = '';
            editor.edit(builder => {
                for (const selection of selections) {
                    try {
                        text = document.getText(selection);
                        const result = math.evaluate(text);
                        const newText = text + ' = ' + result.toString();
                        builder.replace(selection, newText);
                    }
                    catch (err) {
                        const newText = text + ' [error](https://mathjs.org/docs/index.html) ';
                        builder.replace(selection, newText);
                    }
                }
            });
        }
    });
    const toClipboard = vscode.commands.registerCommand('caser.toClipboard', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            var output: string[] = [];
            editor.edit(builder => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    // if the selection includes a collapsed region, expand it
                    const expandedSelection = editor.document.validateRange(selection);
                    const fullText = document.getText(expandedSelection);
                    output.push(fullText);
                }
                vscode.env.clipboard.writeText(output.join('\n')).then(() => {
                    vscode.window.showInformationMessage('Copied to clipboard: ' + output.length.toString() + ' lines');
                }, (err) => {
                    vscode.window.showErrorMessage('Failed to copy to clipboard: ' + err);
                }
                );
            });
        }
    });
    const quickRef = vscode.commands.registerCommand('caser.quickRef', async () => {
        const config = vscode.workspace.getConfiguration('caser');
        let pdfPath = config.get<string>('quickRefPath', '');

        // If path is not set, use the default location in VSCode's appData folder
        if (!pdfPath || pdfPath.trim() === '') {
            const appDataPath = process.env.APPDATA || process.env.HOME;
            if (!appDataPath) {
                vscode.window.showErrorMessage('Could not determine user folder location.');
                return;
            }
            pdfPath = require('path').join(appDataPath, 'Code', 'User', 'quick-reference.pdf');
        }

        // Check if the file exists
        try {
            const uri = vscode.Uri.file(pdfPath);
            await vscode.workspace.fs.stat(uri);

            // Open the PDF inside VSCode using the associated extension
            await vscode.commands.executeCommand('vscode.open', uri);
            vscode.window.showInformationMessage('Quick reference opened.');
        } catch (error) {
            vscode.window.showErrorMessage(`PDF file not found at: ${pdfPath}\n\nPlease set the path in Settings > Caser > Quick Ref Path`);
        }
    });
    const toBash = vscode.commands.registerCommand('caser.toBash', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            var terminal = vscode.window.activeTerminal;
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    name: 'Caser',
                    shellPath: 'gitbash'
                });
            }
            terminal.show();
            // typically we may have a number of lines selected but not individually.
            // We want to execute each line in the terminal one at a time.
            for (const selection of selections) {
                const sel2 = defaultToLineSelected(editor, selection);
                var lines = document.getText(sel2);
                if (lines.length === 0) {
                    continue;
                }
                var linesArray = lines.replace('\r', '').split('\n');
                for (const line of linesArray) {
                    var text = line.trim();
                    if (text.startsWith('`') && text.endsWith('`')) {
                        text = text.replaceAll('`', '').trim();
                    }
                    // send text to terminal
                    terminal.sendText(text);
                }
            }
        }
    });
    const toTerminal = vscode.commands.registerCommand('caser.toTerminal', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            var terminal = vscode.window.activeTerminal;
            if (!terminal) {
                terminal = vscode.window.createTerminal('Caser');
            }
            terminal.show();
            // typically we may have a number of lines selected but not individually.
            // We want to execute each line in the terminal one at a time.
            for (const selection of selections) {
                const sel2 = defaultToLineSelected(editor, selection);
                var lines = document.getText(sel2);
                if (lines.length === 0) {
                    continue;
                }
                var linesArray = lines.replace('\r', '').split('\n');
                var ix = 0;
                for (const line of linesArray) {
                    var text = line.trim();
                    if (text.startsWith('`') && text.endsWith('`')) {
                        text = text.replaceAll('`', '').trim();
                    }
                    //text = text.replaceAll('/', '\\');
                    if (ix++ === 0) {
                        if (!text.toLowerCase().startsWith('cmd')) {
                            text = 'cmd /k ' + text;
                        }
                    }
                    // send text to terminal
                    terminal.sendText(text);
                }
                terminal.sendText('exit');
            }
        }
    });
    const toPowershell = vscode.commands.registerCommand('caser.toPowershell', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            var terminal = vscode.window.activeTerminal;
            if (!terminal) {
                terminal = vscode.window.createTerminal('Caser');
            }
            terminal.show();
            // typically we may have a number of lines selected but not individually.
            // We want to execute each line in the terminal one at a time.
            for (const selection of selections) {
                const sel2 = defaultToLineSelected(editor, selection);
                var lines = document.getText(sel2);
                if (lines.length === 0) {
                    continue;
                }
                var linesArray = lines.replace('\r', '').split('\n');
                var ix = 0;
                for (const line of linesArray) {
                    var text = line.trim();
                    if (text.startsWith('`') && text.endsWith('`')) {
                        text = text.replaceAll('`', '').trim();
                    }
                    // send text to terminal
                    terminal.sendText(text);
                }
            }
        }
    });
    const triageNextRowAsFileName = vscode.commands.registerCommand('caser.triageNextRowAsFileName', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const currentLineNum = selection.start.line;
        const currentLine = document.lineAt(currentLineNum);
        const currentLineText = currentLine.text;

        // Extract filename with extension from the current line
        // Match filenames like: file.txt, path/to/file.js, ../file.cs, etc.
        const filenameRegex = /([^\s<>"|?*:]+\.\w+)/;
        const match = currentLineText.match(filenameRegex);

        if (!match) {
            vscode.window.showInformationMessage('No filename with extension found in current line');
            return;
        }

        const filename = match[1];

        // Trigger the Quick Open file search with the filename from current line
        await vscode.commands.executeCommand('workbench.action.quickOpen', filename);

        // Check if there's a blank line immediately above the current line
        const hasBlankLineAbove = currentLineNum > 0 && document.lineAt(currentLineNum - 1).text.trim() === '';

        await editor.edit(editBuilder => {
            if (hasBlankLineAbove) {
                // Move current line above the blank line
                // Delete the current line (including newline)
                const lineToDelete = new vscode.Range(
                    currentLine.range.start,
                    currentLineNum < document.lineCount - 1
                        ? document.lineAt(currentLineNum + 1).range.start
                        : currentLine.range.end
                );
                editBuilder.delete(lineToDelete);

                // Insert at the position of the blank line (which is currentLineNum - 1)
                const insertPos = new vscode.Position(currentLineNum - 1, 0);
                editBuilder.insert(insertPos, currentLineText + '\n');
            } else {
                // First time: insert a blank line below current line
                const endOfCurrentLine = currentLine.range.end;
                editBuilder.insert(endOfCurrentLine, '\n');
            }
        });

        // Wait for the edit to complete
        await new Promise(resolve => setTimeout(resolve, 50));

        // Position cursor on the line after the blank line (next line to process)
        if (hasBlankLineAbove) {
            // After moving line above blank, the blank is now at currentLineNum
            // Next line to process is at currentLineNum + 1
            const targetLineNum = currentLineNum + 1;
            if (targetLineNum < document.lineCount) {
                const newPosition = new vscode.Position(targetLineNum, 0);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                editor.revealRange(new vscode.Range(newPosition, newPosition));
            } else {
                // No more lines, position on blank line
                const newPosition = new vscode.Position(currentLineNum, 0);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
        } else {
            // First time: blank line inserted at currentLineNum + 1, next line is currentLineNum + 2
            const targetLineNum = currentLineNum + 2;
            if (targetLineNum < document.lineCount) {
                const newPosition = new vscode.Position(targetLineNum, 0);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                editor.revealRange(new vscode.Range(newPosition, newPosition));
            } else {
                // No more lines, position on blank line at currentLineNum + 1
                const blankLineNum = currentLineNum + 1;
                const newPosition = new vscode.Position(blankLineNum, 0);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
        }
    });
    context.subscriptions.push(toCamelCase);
    context.subscriptions.push(toKebabCase);
    context.subscriptions.push(toSnakeCase);
    context.subscriptions.push(toPascalCase);
    context.subscriptions.push(toTitleCase);
    context.subscriptions.push(toOtherCase);
    context.subscriptions.push(toSpaceCase);
    context.subscriptions.push(toEscaped);
    context.subscriptions.push(toUnEscaped);
    context.subscriptions.push(toQuoted);
    context.subscriptions.push(toUnQuoted);
    context.subscriptions.push(toSQuoted);
    context.subscriptions.push(toUnSQuoted);
    context.subscriptions.push(toBackTicked);
    context.subscriptions.push(toUnBackTicked);
    context.subscriptions.push(loremIpsum);
    context.subscriptions.push(toCurly);
    context.subscriptions.push(toAngle);
    context.subscriptions.push(toParens);
    context.subscriptions.push(toSquare);
    context.subscriptions.push(toNone);
    context.subscriptions.push(toStarred);
    context.subscriptions.push(toIndent);
    context.subscriptions.push(toLineComment);
    context.subscriptions.push(toUnderScored);
    context.subscriptions.push(toTilded);
    context.subscriptions.push(toClear);
    context.subscriptions.push(toSecure);
    context.subscriptions.push(toFlip);
    context.subscriptions.push(toCompact);
    context.subscriptions.push(toSwap);
    context.subscriptions.push(markLine);
    context.subscriptions.push(markStep);
    context.subscriptions.push(markWarn);
    context.subscriptions.push(markQuery);
    context.subscriptions.push(markNumber);
    context.subscriptions.push(markNone);
    context.subscriptions.push(markLink);
    context.subscriptions.push(markUser);
    context.subscriptions.push(markRef);
    context.subscriptions.push(toPad);
    context.subscriptions.push(toTrim);
    context.subscriptions.push(toTest);
    context.subscriptions.push(toEnd);
    context.subscriptions.push(toNextEnd);
    context.subscriptions.push(toFence);
    context.subscriptions.push(toPrefixList);
    context.subscriptions.push(toOrder);
    context.subscriptions.push(toSuffixList);
    context.subscriptions.push(toNumbered);
    context.subscriptions.push(toNoSquare);
    context.subscriptions.push(toNoParens);
    context.subscriptions.push(toNoCurly);
    context.subscriptions.push(toNoAngle);
    context.subscriptions.push(toFile);
    context.subscriptions.push(saveToBucket);
    context.subscriptions.push(loadFromBucket);
    context.subscriptions.push(toDos);
    context.subscriptions.push(toUnix);
    context.subscriptions.push(toTogglePipeComma);
    context.subscriptions.push(csvToMarkdownTable);
    context.subscriptions.push(toTree);
    context.subscriptions.push(toAnchor);
    context.subscriptions.push(toHeader);
    context.subscriptions.push(toContinue);
    context.subscriptions.push(toDitto);
    context.subscriptions.push(selectByRegex);
    context.subscriptions.push(toNewLine);
    context.subscriptions.push(toMultiple);
    context.subscriptions.push(toMath);    context.subscriptions.push(toMath);
    context.subscriptions.push(toClipboard);
    context.subscriptions.push(toDimmed);
    context.subscriptions.push(quickRef);
    context.subscriptions.push(toTerminal);
    context.subscriptions.push(toBash);
    context.subscriptions.push(toPowershell);
    context.subscriptions.push(triageNextRowAsFileName);

}

// This method is called when your extension is deactivated
// export function deactivate() {}
