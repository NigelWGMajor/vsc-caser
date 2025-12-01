// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import { unescape } from 'querystring';
import * as vscode from 'vscode';
import * as crypto from 'crypto-js';
const math = require('mathjs');
import { getEnvironmentData } from 'worker_threads';
import { writeHeapSnapshot } from 'v8';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // ////////////////////////////////////////////////////////////
    // TODO: 01
    // Add your function in this section then look for TODO: 02
    ///////////////////////////////////////////////////////////////

    let isDimActive = false;

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
                    const width = match.digits.length;
                    const sign = nextValue < 0 ? '-' : (nextValue > 0 && match.sign === '+') ? '+' : '';
                    const replacement = sign + Math.abs(nextValue).toString().padStart(width, '0');
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
    async function DoSymbols(
        editor: vscode.TextEditor,
        fromSet: string[],
        removeSet: string[],
        selection: vscode.Selection
    ) {
        const document = editor.document;
        //const selections = editor.selections;
        await editor.edit(builder => {
            //for (const selection of selections) {
            // Get the text of the selection
            const text = document.getText(selection);
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
            // Replace the selection with the updated text
            builder.replace(selection, newText);
        });
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

        if (isDimActive && dimRule) {
            const regexPatterns = dimRule.split(':').map(s => s.trim()).filter(Boolean).map(pattern => new RegExp(pattern, 'g'));


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
        textDecoration: 'none; color: #8886;',
    });

    const toDimmed = vscode.commands.registerCommand('caser.toDimmed', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Read settings array and find the first string matching the current language
        const config = vscode.workspace.getConfiguration();
        const definitions: string[] = config.get('caser.dimmableMatches', []);
        const languageId = editor.document.languageId;
        // Find a definition string that starts with the languageId followed by a colon
        const match = definitions.find(defStr => defStr.startsWith(languageId + ':'));
        let dimRule = '';
        if (match) {
            dimRule = match.substring(languageId.length + 1); // everything after 'lang:'
        }
        else {
            // nothing to do in this language.
            vscode.window.setStatusBarMessage('');
            return;
        }
        isDimActive = !isDimActive;
        updateTextVisibilityR(editor, isDimActive, hideDecorationType, dimRule);
        vscode.window.setStatusBarMessage(`${isDimActive ? 'dim' : '==='}`);
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
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            // retrieve the first line of text
            const line = document.lineAt(selection.start.line);
            const lineRange = line.range;
            const lineText = document.getText(lineRange).trim();
            // the first line should have a path in parentheses
            const start = lineText.indexOf('(');
            const end = lineText.indexOf(')', start);
            if (start > -1 && end > start) {
                const filePath = lineText.substring(start + 1, end);
                const adjustedSelection = new vscode.Selection(
                    selection.start.translate(1, 0),
                    selection.end
                );
                const text = document.getText(adjustedSelection);
                // create a new file using the filepath
                // get the current workspace folder
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder or workspace.');
                    return;
                }
                const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
                try {
                    let existingContent = '';

                    // Check if the file exists
                    try {
                        const fileStat = await vscode.workspace.fs.stat(uri);
                        if (fileStat) {
                            // If the file exists, read its content
                            const fileData = await vscode.workspace.fs.readFile(uri);
                            existingContent = fileData.toString();
                        }
                    } catch {
                        // File does not exist, proceed to create it
                    }

                    const content = existingContent + text;

                    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));

                    editor.edit(builder => {
                        builder.delete(adjustedSelection);
                    });
                    const newDocument = await vscode.workspace.openTextDocument(uri);
                    const editor2 = await vscode.window.showTextDocument(newDocument);
                    newDocument.save();
                } catch (error) {
                    vscode.window.showErrorMessage('Error creating file: ' + error);
                }
            }
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
    const toOtherCase = vscode.commands.registerCommand('caser.toOtherCase', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            defaultToWordSelected(editor);
            const document = editor.document;
            const selections = editor.selections;
            editor.edit(builder => {
                for (const selection of selections) {
                    const adjustedSelection = defaultToLineSelected(editor, selection);
                    const text = document.getText(adjustedSelection);
                    var newText;
                    if (text === text.toUpperCase()) {
                        newText = text.toLowerCase();
                    }
                    else if (text === text.toLowerCase()) {
                        newText = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
                        // make title case
                    }
                    else {
                        newText = text.toUpperCase();
                    }
                    builder.replace(adjustedSelection, newText);
                }
            });
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
                    if (text.charAt(selections[0].start.character) === ' '
                        || // the character before this one is a space
                        text.charAt(selections[0].start.character - 1) === ' '
                    ) {
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
                    else if (selections.length === 1 && selections[0].isEmpty && selections[0].start.character > 0) {
                        // exchange the letters at the cursor
                        const range1 = new vscode.Range(selections[0].start, selections[0].start.translate(0, 1));
                        const range2 = new vscode.Range(selections[0].start.translate(0, -1), selections[0].start);
                        const text1 = document.getText(range1);
                        const text2 = document.getText(range2);
                        editor.edit(builder => {
                            builder.replace(range1, text2);
                            builder.replace(range2, text1);
                        }
                        );
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
    const markQuery = vscode.commands.registerCommand('caser.markQuery', () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', ["🟥", "🟨", "🟩", "🟦", "✅", "❎"]);
        const setB = config.get<string[]>('dotIcons', ["🔴", "🟡", "🟢", "🔵", "✔️", "✖️"]);
        const setC = config.get<string[]>('stepIcons', ["💭", "🔎", "👋", "💡", "🚧", "🎁"]);
        const setD = config.get<string[]>('queryIcons', ["❓", "⁉️", "❌", "❗", "‼️", "🛑"]);
        const setAll = [...setA, ...setB, ...setC, ...setD];
        if (editor) {
            for (const selection of editor.selections) {
                DoSymbols(editor, setD, setAll, AdjustSelectionForPrefix(editor, selection));
            }
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
    const markLine = vscode.commands.registerCommand('caser.markLine', () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('squareIcons', ["🟥", "🟨", "🟩", "🟦", "✅", "❎"]);
        const setB = config.get<string[]>('dotIcons', ["🔴", "🟡", "🟢", "🔵", "✔️", "✖️"]);
        const setC = config.get<string[]>('stepIcons', ["💭", "🔎", "👋", "💡", "🚧", "🎁"]);
        const setD = config.get<string[]>('queryIcons', ["❓", "⁉️", "❌", "❗", "‼️", "🛑"]);
        const setAll = [...setA, ...setB, ...setC, ...setD];
        if (editor) {
            const document = editor.document;
            const newSelections: vscode.Selection[] = [];
            const selections = editor.selections;
            for (const selection of selections) {
                // if the selection starts with one of the set characters, set the position there
                const line = document.lineAt(selection.start.line);
                const lineRange = line.range;
                const lineText = document.getText(lineRange);
                // get the index of the first matching character
                const index = setAll.findIndex(char => lineText.startsWith(char));
                if (index === -1) { // no match, need to adjust for any prefix
                    const adjustedSelection = AdjustSelectionForPrefix(editor, selection);
                    newSelections.push(adjustedSelection);
                } else {
                    //find the position of setA[index] in the line
                    const ix = lineText.indexOf(setAll[index]);
                    if (ix > -1) {
                        // if found, extend the selection to include the markers
                        const start = line.range.start.translate(0, ix);
                        const end = line.range.end;
                        newSelections.push(new vscode.Selection(start, end));
                    } else {
                        const adjustedSelection = AdjustSelectionForPrefix(editor, selection);
                        newSelections.push(adjustedSelection);
                    }
                }
            }

            // if line starts with one of the set characters, replace it with the subsequent character
            editor.edit(async builder => {
                for (const selection of newSelections) {
                    var line = document.getText(selection);
                    const fullLine = document.lineAt(selection.start.line).text;
                    let isHeading = fullLine.startsWith('#');
                    if (isHeading) {
                        await DoSymbols(editor, setA, setAll, selection);
                    }
                    else {
                        await DoSymbols(editor, setB, setAll, selection);
                    }
                }
            });
            editor.selections = newSelections;
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
            await doSymbolsInPlace(editor, setA, setA);
        }
    });
    const markUser = vscode.commands.registerCommand('caser.markUser', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('userIcons', ["👬", "😁", "😞", "☘️", "🕊️", "🎗️"]);
        if (editor) {
            await doSymbolsInPlace(editor, setA, setA);
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
            for (const selection of editor.selections) {
                await DoSymbols(editor, setC, setAll, AdjustSelectionForPrefix(editor, selection));
            }
        }
    });
    const markLink = vscode.commands.registerCommand('caser.markLink', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('caser');
        const setA = config.get<string[]>('linkIcons', ["[🔗]()", "[🔖](#)", "[🎟️]()", "[🔀]()", "[📚]()", "[⏪]()", "[⏩]()"]);
        if (editor) {
            //AdjustSelectionsForPrefix(editor);
            await doSymbolsInPlace(editor, setA, setA);
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
    context.subscriptions.push(toPrefixList);
    context.subscriptions.push(toSuffixList);
    context.subscriptions.push(toNumbered);
    context.subscriptions.push(toNoSquare);
    context.subscriptions.push(toNoParens);
    context.subscriptions.push(toNoCurly);
    context.subscriptions.push(toNoAngle);
    context.subscriptions.push(toFile);
    context.subscriptions.push(toDos);
    context.subscriptions.push(toUnix);
    context.subscriptions.push(toTogglePipeComma);
    context.subscriptions.push(selectByRegex);
    context.subscriptions.push(toNewLine);
    context.subscriptions.push(toMath);
    context.subscriptions.push(toClipboard);
    context.subscriptions.push(toDimmed);
    context.subscriptions.push(quickRef);
    context.subscriptions.push(toTerminal);
    context.subscriptions.push(toBash);
    context.subscriptions.push(toPowershell);

}

// This method is called when your extension is deactivated
// export function deactivate() {}
