import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

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
});

async function waitForDocumentText(document: vscode.TextDocument, expected: string): Promise<void> {
	const timeoutAt = Date.now() + 1000;
	while (document.getText() !== expected && Date.now() < timeoutAt) {
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}
