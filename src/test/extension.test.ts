import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { buildAnchorDetails } from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('toSwap exchanges adjacent non-whitespace characters at an empty cursor', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'abcd' });
		const editor = await vscode.window.showTextDocument(document);
		const cursor = new vscode.Position(0, 2);
		editor.selection = new vscode.Selection(cursor, cursor);

		await vscode.commands.executeCommand('caser.toSwap');
		await waitForDocumentText(document, 'acbd');

		assert.strictEqual(document.getText(), 'acbd');
	});

	test('toSwap does not exchange a character with whitespace', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'ab\tcd' });
		const editor = await vscode.window.showTextDocument(document);
		const cursor = new vscode.Position(0, 2);
		editor.selection = new vscode.Selection(cursor, cursor);

		await vscode.commands.executeCommand('caser.toSwap');
		await new Promise(resolve => setTimeout(resolve, 50));

		assert.strictEqual(document.getText(), 'ab\tcd');
	});

	test('toIndent cycles a Markdown bullet in two-space steps and removes it', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'item' });
		const editor = await vscode.window.showTextDocument(document);
		const cursor = new vscode.Position(0, 2);
		editor.selection = new vscode.Selection(cursor, cursor);
		const expectedLines = [
			'- item',
			'  - item',
			'    - item',
			'item'
		];

		for (const expectedLine of expectedLines) {
			await vscode.commands.executeCommand('caser.toIndent');
			assert.strictEqual(document.getText(), expectedLine);
		}
	});

	test('toLineComment preserves ordinary inline and multi-line HTML comments', async () => {
		const original = [
			'alpha <!-- ordinary --> omega',
			'<!-- ordinary',
			'inside',
			'--> tail'
		].join('\n');
		const commented = [
			'<!-- !! alpha !! --> <!-- ordinary --> <!-- !! omega !! -->',
			'<!-- ordinary',
			'inside',
			'--> <!-- !! tail !! -->'
		].join('\n');
		const document = await vscode.workspace.openTextDocument({
			content: original,
			language: 'markdown'
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(document.lineCount - 1).range.end
		);

		await vscode.commands.executeCommand('caser.toLineComment');
		assert.strictEqual(document.getText(), commented);

		await vscode.commands.executeCommand('caser.toLineComment');
		assert.strictEqual(document.getText(), original);
	});

	test('toOtherCase selects the current or touching word when the cursor is empty', async () => {
		for (const cursorCharacter of [7, 9, 11]) {
			const document = await vscode.workspace.openTextDocument({
				content: 'before word after',
				language: 'markdown'
			});
			const editor = await vscode.window.showTextDocument(document);
			const cursor = new vscode.Position(0, cursorCharacter);
			editor.selection = new vscode.Selection(cursor, cursor);

			await vscode.commands.executeCommand('caser.toOtherCase');

			assert.strictEqual(document.getText(), 'before Word after');
			assert.strictEqual(editor.selection.isEmpty, false);
			assert.strictEqual(document.getText(editor.selection), 'Word');
		}
	});

	test('toNextEnd moves to the current line end, then the next line end', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'first\nsecond line' });
		const editor = await vscode.window.showTextDocument(document);
		const cursor = new vscode.Position(0, 2);
		editor.selection = new vscode.Selection(cursor, cursor);

		await vscode.commands.executeCommand('caser.toNextEnd');
		assert.deepStrictEqual(editor.selection.active, document.lineAt(0).range.end);

		await vscode.commands.executeCommand('caser.toNextEnd');
		assert.deepStrictEqual(editor.selection.active, document.lineAt(1).range.end);
	});

	test('toNextEnd remains at the end of the final line', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'only line' });
		const editor = await vscode.window.showTextDocument(document);
		const lineEnd = document.lineAt(0).range.end;
		editor.selection = new vscode.Selection(lineEnd, lineEnd);

		await vscode.commands.executeCommand('caser.toNextEnd');
		assert.deepStrictEqual(editor.selection.active, lineEnd);
	});

	test('toAnchor formats a numbered anchor and workspace-relative bookmark link', () => {
		assert.deepStrictEqual(
			buildAnchorDetails('notes\\example.md', 11),
			{
				anchorId: 'ref-12',
				anchor: '<a id="ref-12"></a>',
				bookmarkLink: '[ref-12](./notes/example.md#ref-12)'
			}
		);
	});

	test('markLink selects the title after inserting a link', async () => {
		await vscode.env.clipboard.writeText('https://example.test');
		const document = await vscode.workspace.openTextDocument({ content: 'My title' });
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(0).range.end
		);

		await vscode.commands.executeCommand('caser.markLink');

		assert.strictEqual(document.getText(), '[🔗 My title](https://example.test)');
		assert.strictEqual(document.getText(editor.selection), 'My title');
	});

	test('markLink places the cursor in an empty title', async () => {
		await vscode.env.clipboard.writeText('https://example.test');
		const document = await vscode.workspace.openTextDocument({ content: '' });
		const editor = await vscode.window.showTextDocument(document);

		await vscode.commands.executeCommand('caser.markLink');

		assert.strictEqual(document.getText(), '[🔗 ](https://example.test)');
		assert.strictEqual(editor.selection.isEmpty, true);
		assert.strictEqual(document.offsetAt(editor.selection.active), '[🔗 '.length);
	});

	test('toFence wraps selected text and keeps its content selected', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'fenced content' });
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(0).range.end
		);

		await vscode.commands.executeCommand('caser.toFence');

		const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
		assert.strictEqual(document.getText(), ['```cs', 'fenced content', '```'].join(eol));
		assert.strictEqual(document.getText(editor.selection), 'fenced content');
	});

	test('toFence inserts an empty block with the cursor on the content line', async () => {
		const document = await vscode.workspace.openTextDocument({ content: '' });
		const editor = await vscode.window.showTextDocument(document);

		await vscode.commands.executeCommand('caser.toFence');

		const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
		assert.strictEqual(document.getText(), ['```cs', '', '```'].join(eol));
		assert.deepStrictEqual(editor.selection.active, new vscode.Position(1, 0));
	});

	test('toFence cycles the type of a selected fenced block', async () => {
		const document = await vscode.workspace.openTextDocument({ content: '```cs\nvalue\n```' });
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(document.lineCount - 1).range.end
		);

		await vscode.commands.executeCommand('caser.toFence');

		assert.strictEqual(document.getText(), '```json\nvalue\n```');
		assert.strictEqual(document.getText(editor.selection), document.getText());
	});

	test('toFence cycles the opening type when the cursor is on a closing fence', async () => {
		const document = await vscode.workspace.openTextDocument({ content: '```sql\nvalue\n```' });
		const editor = await vscode.window.showTextDocument(document);
		const closingFenceEnd = document.lineAt(2).range.end;
		editor.selection = new vscode.Selection(closingFenceEnd, closingFenceEnd);

		await vscode.commands.executeCommand('caser.toFence');

		assert.strictEqual(document.getText(), '```ps\nvalue\n```');
		assert.deepStrictEqual(editor.selection.active, editor.document.lineAt(2).range.end);
	});
});

async function waitForDocumentText(document: vscode.TextDocument, expected: string): Promise<void> {
	const timeoutAt = Date.now() + 1000;
	while (document.getText() !== expected && Date.now() < timeoutAt) {
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}
