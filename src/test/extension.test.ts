import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { buildAnchorDetails } from '../extension';
import {
	expandImagePathMove,
	nestImagesInMarkdown,
	planImageLinkUpdatesForMoves
} from '../imageNesting';
import {
	formatNestedImageMarkdown,
	getClipboardImageExtension,
	normalizeImageTitle,
	toLowerKebabFileStem
} from '../nestedImagePaste';
import {
	collapseToOneLine,
	unwrapMarkdownTableColumns,
	wrapMarkdownTableColumns
} from '../selectionTransforms';
import {
    findDocumentsReferencingImage,
    findDocumentsReferencingImages,
    formatWhereUsedMessage,
    isImageFilePath,
    partitionImagesByLocalUsage
} from '../whereUsedLocally';
import {
	brokenDocumentLinkMarker,
	expandMarkdownPathMove,
	moveDocumentWithLinks,
	partitionDocumentsByUsage,
	planDocumentLinkUpdatesForMoves,
	repairDocumentLinks
} from '../documentLinks';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('toOneLine joins selected lines and preserves the final newline', async () => {
		const document = await vscode.workspace.openTextDocument({
			content: 'alpha  \t\n  beta\t\t\ngamma   \nnext'
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(3).range.start
		);

		await vscode.commands.executeCommand('caser.toOneLine');

		assert.strictEqual(document.getText(), 'alpha beta gamma \nnext');
	});

	test('collapseToOneLine leaves multiple spaces inside a line unchanged', () => {
		assert.strictEqual(
			collapseToOneLine('alpha  middle\nbeta'),
			'alpha  middle beta'
		);
	});

	test('toWrappedColumns displays long cells on padded continuation rows', async () => {
		const input = [
			'| Key | Details |',
			'| --- | --- |',
			'| A | one two three four |',
			'| B | short |'
		].join('\n');
		const expected = [
			'| Key | Details    |',
			'| --- | ---------- |',
			'| A   | one two    |',
			'|     | three four |',
			'| B   | short      |'
		].join('\n');

		assert.strictEqual(wrapMarkdownTableColumns(input, 10), expected);

		const longCell = 'x'.repeat(41);
		const document = await vscode.workspace.openTextDocument({
			content: `| Key | Details |\n| --- | --- |\n| A | ${longCell} |`,
			language: 'markdown'
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(document.lineCount - 1).range.end
		);

		await vscode.commands.executeCommand('caser.toWrappedColumns');

		const outputLines = document.getText().split('\n');
		assert.strictEqual(outputLines[2].includes('x'.repeat(40)), true);
		assert.strictEqual(outputLines[3].startsWith('|     | x'), true);
	});

	test('toUnwrappedColumns restores rows using empty first-column cells', async () => {
		const input = [
			'| Key | Details    | Notes  |',
			'| --- | ---------- | ------ |',
			'| A   | one two    | first  |',
			'|     | three four | second |',
			'|     | five       |        |',
			'| B   | short      | last   |'
		].join('\n');
		const expected = [
			'| Key | Details                 | Notes        |',
			'| --- | ----------------------- | ------------ |',
			'| A   | one two three four five | first second |',
			'| B   | short                   | last         |'
		].join('\n');

		assert.strictEqual(unwrapMarkdownTableColumns(input), expected);

		const document = await vscode.workspace.openTextDocument({
			content: input,
			language: 'markdown'
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(
			document.lineAt(0).range.start,
			document.lineAt(document.lineCount - 1).range.end
		);

		await vscode.commands.executeCommand('caser.toUnwrappedColumns');

		assert.strictEqual(document.getText(), expected);
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

	test('markQuery cleans duplicate prefixes without altering symbols in the content', async () => {
		const cases = [
			{ input: '❓ ❓ investigate', expected: '⁉️ investigate' },
			{ input: '⁉ investigate', expected: '❌ investigate' },
			{ input: 'plain ❓ content', expected: '❓ plain ❓ content' },
			{ input: '💭 ❓ mixed markers', expected: '❓ mixed markers' }
		];

		for (const testCase of cases) {
			const document = await vscode.workspace.openTextDocument({
				content: testCase.input,
				language: 'markdown'
			});
			const editor = await vscode.window.showTextDocument(document);
			const cursor = document.lineAt(0).range.start;
			editor.selection = new vscode.Selection(cursor, cursor);

			await vscode.commands.executeCommand('caser.markQuery');

			assert.strictEqual(document.getText(), testCase.expected);
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

	test('toAnchor wraps a bookmark target containing spaces in angle brackets', () => {
		assert.deepStrictEqual(
			buildAnchorDetails('project notes\\daily log.md', 4),
			{
				anchorId: 'ref-5',
				anchor: '<a id="ref-5"></a>',
				bookmarkLink: '[ref-5](<./project notes/daily log.md#ref-5>)'
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

	test('to-NestImages moves a resolving image into the local image folder', async () => {
		await withTemporaryFolder(async root => {
			const notes = path.join(root, 'notes');
			const markdown = path.join(notes, 'readme.md');
			const sourceImage = path.join(notes, 'diagram.png');
			await fs.mkdir(notes, { recursive: true });
			await fs.writeFile(sourceImage, 'image data');
			await fs.writeFile(markdown, '![Architecture](diagram.png)');

			const result = await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), '![Architecture](image/diagram.png)');
			assert.strictEqual(await fileExists(sourceImage), false);
			assert.strictEqual(await fs.readFile(path.join(notes, 'image', 'diagram.png'), 'utf8'), 'image data');
			assert.strictEqual(result.moved, 1);
			assert.strictEqual(result.broken, 0);
		});
	});

	test('to-NestImages repairs an image from any nested image folder', async () => {
		await withTemporaryFolder(async root => {
			const notes = path.join(root, 'docs', 'notes');
			const markdown = path.join(notes, 'readme.md');
			const discoveredImage = path.join(root, 'assets', 'image', 'diagrams', 'found.png');
			await fs.mkdir(path.dirname(discoveredImage), { recursive: true });
			await fs.mkdir(notes, { recursive: true });
			await fs.writeFile(discoveredImage, 'found');
			await fs.writeFile(markdown, '![Found](missing/found.png)');

			const result = await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(
				await fs.readFile(markdown, 'utf8'),
				'![Found](../../assets/image/diagrams/found.png)'
			);
			assert.strictEqual(result.repaired, 1);
			assert.strictEqual(result.moved, 0);
		});
	});

	test('to-NestImages searches parent folders and then nests a recovered image', async () => {
		await withTemporaryFolder(async root => {
			const notes = path.join(root, 'docs', 'notes');
			const markdown = path.join(notes, 'readme.md');
			const parentImage = path.join(root, 'lost.png');
			await fs.mkdir(notes, { recursive: true });
			await fs.writeFile(parentImage, 'recovered');
			await fs.writeFile(markdown, '![Recovered](lost.png)');

			const result = await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), '![Recovered](image/lost.png)');
			assert.strictEqual(await fileExists(parentImage), false);
			assert.strictEqual(await fs.readFile(path.join(notes, 'image', 'lost.png'), 'utf8'), 'recovered');
			assert.strictEqual(result.moved, 1);
		});
	});

	test('to-NestImages marks unresolved images once and leaves remote images alone', async () => {
		await withTemporaryFolder(async root => {
			const markdown = path.join(root, 'readme.md');
			await fs.writeFile(markdown, [
				'![Missing](nope.png)',
				'![Empty]()',
				'![Remote](https://example.test/image.png)'
			].join('\n'));

			await nestImagesInMarkdown(markdown, { searchRoot: root });
			await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), [
				'![⛓️‍💥 Missing](nope.png)',
				'![⛓️‍💥 Empty]()',
				'![Remote](https://example.test/image.png)'
			].join('\n'));
		});
	});

	test('to-NestImages moves a source only once when references use different spellings', async () => {
		await withTemporaryFolder(async root => {
			const markdown = path.join(root, 'readme.md');
			await fs.writeFile(path.join(root, 'same.png'), 'same');
			await fs.writeFile(markdown, [
				'![First](same.png)',
				'![Second](./same.png?raw=1)'
			].join('\n'));

			const result = await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), [
				'![First](image/same.png)',
				'![Second](image/same.png?raw=1)'
			].join('\n'));
			assert.strictEqual(result.moved, 1);
		});
	});

	test('to-NestImages updates reference-style image definitions', async () => {
		await withTemporaryFolder(async root => {
			const markdown = path.join(root, 'readme.md');
			const sourceImage = path.join(root, 'reference.png');
			await fs.writeFile(sourceImage, 'reference');
			await fs.writeFile(markdown, [
				'![Reference image][diagram]',
				'',
				'[diagram]: reference.png "Optional title"'
			].join('\n'));

			await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), [
				'![Reference image][diagram]',
				'',
				'[diagram]: image/reference.png "Optional title"'
			].join('\n'));
		});
	});

	test('to-NestImages handles image syntax in comments, fences, and inline code', async () => {
		await withTemporaryFolder(async root => {
			const markdown = path.join(root, 'readme.md');
			for (const image of ['inline.png', 'fenced.png', 'commented.png', 'live.png']) {
				await fs.writeFile(path.join(root, image), image);
			}
			await fs.writeFile(markdown, [
				'`![Inline example](inline.png)`',
				'```markdown',
				'![Fenced example](fenced.png)',
				'```',
				'<!-- ![Historical](commented.png) -->',
				'![Live](live.png)'
			].join('\n'));

			await nestImagesInMarkdown(markdown, { searchRoot: root });

			assert.strictEqual(await fs.readFile(markdown, 'utf8'), [
				'`![Inline example](image/inline.png)`',
				'```markdown',
				'![Fenced example](image/fenced.png)',
				'```',
				'<!-- ![Historical](image/commented.png) -->',
				'![Live](image/live.png)'
			].join('\n'));
		});
	});

	test('to-NestImages accepts multiple Explorer selections', async () => {
		await withTemporaryFolder(async root => {
			const markdownFiles = [
				path.join(root, 'first', 'one.md'),
				path.join(root, 'second', 'two.md')
			];
			for (const markdown of markdownFiles) {
				await fs.mkdir(path.dirname(markdown), { recursive: true });
				await fs.writeFile(path.join(path.dirname(markdown), 'picture.png'), 'picture');
				await fs.writeFile(markdown, '![Picture](picture.png)');
			}

			const uris = markdownFiles.map(file => vscode.Uri.file(file));
			await vscode.commands.executeCommand('caser.toNestImages', uris[0], uris);

			for (const markdown of markdownFiles) {
				assert.strictEqual(
					await fs.readFile(markdown, 'utf8'),
					'![Picture](image/picture.png)'
				);
				assert.strictEqual(
					await fs.readFile(path.join(path.dirname(markdown), 'image', 'picture.png'), 'utf8'),
					'picture'
				);
			}
		});
	});

	test('to-PasteNestedImage delegates ordinary Markdown text paste', async () => {
		await withTemporaryFolder(async root => {
			const markdown = path.join(root, 'paste.md');
			await fs.writeFile(markdown, '');
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(markdown));
			await vscode.window.showTextDocument(document);
			await vscode.env.clipboard.writeText('pasted text');

			await vscode.commands.executeCommand('caser.toPasteNestedImage');
			await waitForDocumentText(document, 'pasted text');

			assert.strictEqual(document.getText(), 'pasted text');
		});
	});

	test('to-PasteNestedImage configures Markdown clipboard files for the image folder', () => {
		const destination = vscode.workspace
			.getConfiguration('markdown')
			.get<Record<string, string>>('copyFiles.destination');

		assert.deepStrictEqual(destination, {
			'**/*': '${documentDirName}/image/${fileName}'
		});
	});

	test('to-PasteNestedImage derives its title and kebab filename from selected text', () => {
		const title = normalizeImageTitle('  System\nOverview  ');
		const fileName = `${toLowerKebabFileStem(title)}${getClipboardImageExtension('image/png', '')}`;

		assert.strictEqual(title, 'System Overview');
		assert.strictEqual(fileName, 'system-overview.png');
		assert.strictEqual(
			formatNestedImageMarkdown(title, fileName),
			'![System Overview](image/system-overview.png)'
		);
	});

	test('to-PasteNestedImage normalizes punctuation and diacritics in generated filenames', () => {
		assert.strictEqual(
			toLowerKebabFileStem('Résumé: Q3 Results!'),
			'resume-q3-results'
		);
		assert.strictEqual(
			formatNestedImageMarkdown('Array [Before]', 'array-before.png'),
			'![Array \\[Before\\]](image/array-before.png)'
		);
	});

	test('to-WhereUsedLocally finds references in the image folder and its ancestors', async () => {
		await withTemporaryFolder(async root => {
			const notes = path.join(root, 'notes');
			const imageFolder = path.join(notes, 'image');
			const childFolder = path.join(notes, 'child');
			const image = path.join(imageFolder, 'system overview.png');
			await fs.mkdir(imageFolder, { recursive: true });
			await fs.mkdir(childFolder, { recursive: true });
			await fs.writeFile(image, 'image');

			const sameFolder = path.join(imageFolder, 'details.md');
			const parentFolder = path.join(notes, 'page.md');
			const rootFolder = path.join(root, 'index.md');
			await fs.writeFile(sameFolder, '![Details](<system overview.png>)');
			await fs.writeFile(parentFolder, '![Overview](image/system%20overview.png#preview)');
			await fs.writeFile(rootFolder, '![Overview][diagram]\n\n[diagram]: notes/image/system%20overview.png');
			await fs.writeFile(
				path.join(childFolder, 'excluded.md'),
				'![Overview](../image/system%20overview.png)'
			);
			await fs.writeFile(path.join(notes, 'unrelated.md'), 'system overview.png');

			assert.deepStrictEqual(
				await findDocumentsReferencingImage(image, root),
				[sameFolder, parentFolder, rootFolder]
			);
		});
	});

	test('to-WhereUsedLocally recognizes supported image file extensions', () => {
		assert.strictEqual(isImageFilePath('diagram.PNG'), true);
		assert.strictEqual(isImageFilePath('diagram.svg'), true);
		assert.strictEqual(isImageFilePath('notes.md'), false);
	});

	test('to-WhereUsedLocally combines references from multiple selected images', async () => {
		await withTemporaryFolder(async root => {
			const imageFolder = path.join(root, 'image');
			const firstImage = path.join(imageFolder, 'first.png');
			const secondImage = path.join(imageFolder, 'second.png');
			await fs.mkdir(imageFolder, { recursive: true });
			await fs.writeFile(firstImage, 'first image');
			await fs.writeFile(secondImage, 'second image');

			const firstOnly = path.join(root, 'first.md');
			const bothImages = path.join(root, 'both.md');
			const secondOnly = path.join(root, 'second.md');
			await fs.writeFile(firstOnly, '![First](image/first.png)');
			await fs.writeFile(
				bothImages,
				'![First](image/first.png)\n![Second](image/second.png)'
			);
			await fs.writeFile(secondOnly, '![Second](image/second.png)');

			assert.deepStrictEqual(
				await findDocumentsReferencingImages([firstImage, secondImage], root),
				[bothImages, firstOnly, secondOnly]
			);
		});
	});

	test('to-WhereUsedLocally reports workspace-relative Markdown paths', () => {
		const workspaceRoot = path.join('workspace', 'root');
		const image = path.join(workspaceRoot, 'notes', 'image', 'diagram.png');
		const matchingPaths = [
			path.join(workspaceRoot, 'notes', 'page.md'),
			path.join(workspaceRoot, 'index.md')
		];

		assert.strictEqual(
			formatWhereUsedMessage(image, matchingPaths, workspaceRoot),
			'diagram.png is used by 2 Markdown files: notes/page.md, index.md'
		);
	});

	test('to-WhereUsedLocally reports multiple selected images', () => {
		const workspaceRoot = path.join('workspace', 'root');
		const images = [
			path.join(workspaceRoot, 'image', 'first.png'),
			path.join(workspaceRoot, 'image', 'second.png')
		];
		const matchingPaths = [path.join(workspaceRoot, 'page.md')];

		assert.strictEqual(
			formatWhereUsedMessage(images, matchingPaths, workspaceRoot),
			'2 images are used by 1 Markdown file: page.md'
		);
	});

	test('to-UnusedImages partitions referenced and unused selected images', async () => {
		await withTemporaryFolder(async root => {
			const imageFolder = path.join(root, 'image');
			const referencedImage = path.join(imageFolder, 'referenced.png');
			const unusedImage = path.join(imageFolder, 'unused.png');
			await fs.mkdir(imageFolder, { recursive: true });
			await fs.writeFile(referencedImage, 'referenced image');
			await fs.writeFile(unusedImage, 'unused image');
			await fs.writeFile(
				path.join(root, 'page.md'),
				'![Referenced](image/referenced.png)'
			);

			assert.deepStrictEqual(
				await partitionImagesByLocalUsage(
					[referencedImage, unusedImage],
					root
				),
				{
					referencedImagePaths: [referencedImage],
					unusedImagePaths: [unusedImage]
				}
			);
		});
	});

	test('to-UnusedImages only treats same-folder or upstream documents as references', async () => {
		await withTemporaryFolder(async root => {
			const firstFolder = path.join(root, 'first');
			const secondFolder = path.join(root, 'second');
			const image = path.join(firstFolder, 'image', 'diagram.png');
			await fs.mkdir(path.dirname(image), { recursive: true });
			await fs.mkdir(secondFolder, { recursive: true });
			await fs.writeFile(image, 'image');
			await fs.writeFile(
				path.join(secondFolder, 'sibling.md'),
				'![Diagram](../first/image/diagram.png)'
			);

			assert.deepStrictEqual(
				await partitionImagesByLocalUsage([image], root),
				{
					referencedImagePaths: [],
					unusedImagePaths: [image]
				}
			);
		});
	});

	test('to-RepairDocumentLinks repairs a uniquely moved target and marks missing links', async () => {
		await withTemporaryFolder(async root => {
			const page = path.join(root, 'notes', 'page.md');
			const movedTarget = path.join(root, 'guides', 'setup guide.md');
			await fs.mkdir(path.dirname(page), { recursive: true });
			await fs.mkdir(path.dirname(movedTarget), { recursive: true });
			await fs.writeFile(movedTarget, '# Setup');
			await fs.writeFile(page, [
				'[Setup](../old/setup%20guide.md#install)',
				'[Missing](missing.md)',
				'![Not a document](missing.md)',
				'[External](https://example.com/readme.md)'
			].join('\n'));

			const result = await repairDocumentLinks(page, root);

			assert.deepStrictEqual(result, {
				markdownPath: page,
				links: 2,
				repaired: 1,
				broken: 1,
				unchanged: 0
			});
			assert.strictEqual(
				await fs.readFile(page, 'utf8'),
				[
					'[Setup](<../guides/setup guide.md#install>)',
					`[${brokenDocumentLinkMarker} Missing](missing.md)`,
					'![Not a document](missing.md)',
					'[External](https://example.com/readme.md)'
				].join('\n')
			);
		});
	});

	test('to-RepairDocumentLinks does not guess between duplicate filenames', async () => {
		await withTemporaryFolder(async root => {
			const page = path.join(root, 'page.md');
			await fs.mkdir(path.join(root, 'first'), { recursive: true });
			await fs.mkdir(path.join(root, 'second'), { recursive: true });
			await fs.writeFile(path.join(root, 'first', 'topic.md'), '# First');
			await fs.writeFile(path.join(root, 'second', 'topic.md'), '# Second');
			await fs.writeFile(page, '[Topic](old/topic.md)');

			const result = await repairDocumentLinks(page, root);

			assert.strictEqual(result.repaired, 0);
			assert.strictEqual(result.broken, 1);
			assert.strictEqual(
				await fs.readFile(page, 'utf8'),
				`[${brokenDocumentLinkMarker} Topic](old/topic.md)`
			);
		});
	});

	test('to-UnreferencedDocuments recognizes direct and uniquely recoverable inbound links', async () => {
		await withTemporaryFolder(async root => {
			const first = path.join(root, 'first.md');
			const second = path.join(root, 'second.md');
			const moved = path.join(root, 'archive', 'moved.md');
			const index = path.join(root, 'index.md');
			await fs.mkdir(path.dirname(moved), { recursive: true });
			await fs.writeFile(first, '[Self](first.md)');
			await fs.writeFile(second, '# Second');
			await fs.writeFile(moved, '# Moved');
			await fs.writeFile(index, [
				'[Second](second.md)',
				'[Moved](old/moved.md)'
			].join('\n'));

			assert.deepStrictEqual(
				await partitionDocumentsByUsage([first, second, moved], root),
				{
					referencedDocumentPaths: [second, moved],
					unusedDocumentPaths: [first]
				}
			);
		});
	});

	test('to-NewDocumentLocation preserves outgoing and incoming document links', async () => {
		await withTemporaryFolder(async root => {
			const source = path.join(root, 'docs', 'source.md');
			const destination = path.join(root, 'archive', '2026', 'source.md');
			const target = path.join(root, 'shared', 'target.md');
			const index = path.join(root, 'index.md');
			const referencePage = path.join(root, 'refs', 'reference.md');
			await fs.mkdir(path.dirname(source), { recursive: true });
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.mkdir(path.dirname(referencePage), { recursive: true });
			await fs.writeFile(target, '# Target');
			await fs.writeFile(source, [
				'[Target](../shared/target.md#part)',
				'[Self](source.md#top)',
				'![Image](image.png)'
			].join('\n'));
			await fs.writeFile(index, '[Source](docs/source.md?view=1)');
			await fs.writeFile(referencePage, [
				'[Source][source]',
				'',
				'[source]: ../docs/source.md#ref'
			].join('\n'));

			const result = await moveDocumentWithLinks(source, destination, root);

			assert.deepStrictEqual(result, {
				sourcePath: source,
				destinationPath: destination,
				incomingLinksUpdated: 2,
				outgoingLinksUpdated: 1,
				documentsUpdated: 3
			});
			assert.strictEqual(await fileExists(source), false);
			assert.strictEqual(await fileExists(destination), true);
			assert.strictEqual(
				await fs.readFile(destination, 'utf8'),
				[
					'[Target](../../shared/target.md#part)',
					'[Self](source.md#top)',
					'![Image](image.png)'
				].join('\n')
			);
			assert.strictEqual(
				await fs.readFile(index, 'utf8'),
				'[Source](archive/2026/source.md?view=1)'
			);
			assert.strictEqual(
				await fs.readFile(referencePage, 'utf8'),
				[
					'[Source][source]',
					'',
					'[source]: ../archive/2026/source.md#ref'
				].join('\n')
			);
		});
	});

	test('automatic folder moves map Markdown descendants and preserve internal links', async () => {
		await withTemporaryFolder(async root => {
			const sourceFolder = path.join(root, 'section');
			const destinationFolder = path.join(root, 'archive');
			const first = path.join(sourceFolder, 'first.md');
			const second = path.join(sourceFolder, 'second.md');
			const index = path.join(root, 'index.md');
			await fs.mkdir(sourceFolder, { recursive: true });
			await fs.writeFile(first, '[Second](second.md)');
			await fs.writeFile(second, '# Second');
			await fs.writeFile(index, '[First](section/first.md)');

			const moves = await expandMarkdownPathMove(
				sourceFolder,
				destinationFolder
			);
			const plan = await planDocumentLinkUpdatesForMoves(moves, root);

			assert.deepStrictEqual(moves, [
				{
					sourcePath: first,
					destinationPath: path.join(destinationFolder, 'first.md')
				},
				{
					sourcePath: second,
					destinationPath: path.join(destinationFolder, 'second.md')
				}
			]);
			assert.strictEqual(plan.outgoingLinksUpdated, 0);
			assert.strictEqual(plan.incomingLinksUpdated, 1);
			assert.strictEqual(plan.updates.length, 1);
			assert.strictEqual(
				plan.updates[0].updatedContent,
				'[First](archive/first.md)'
			);
		});
	});

	test('automatic image moves update inbound Markdown image references', async () => {
		await withTemporaryFolder(async root => {
			const imageFolder = path.join(root, 'image');
			const originalImage = path.join(imageFolder, 'before.png');
			const movedImage = path.join(imageFolder, 'after.png');
			const page = path.join(root, 'page.md');
			await fs.mkdir(imageFolder, { recursive: true });
			await fs.writeFile(originalImage, 'image');
			await fs.writeFile(page, '![Before](image/before.png#preview)');

			const imageMoves = await expandImagePathMove(
				originalImage,
				movedImage
			);
			const plan = await planImageLinkUpdatesForMoves(
				imageMoves,
				[],
				root
			);

			assert.strictEqual(plan.linksUpdated, 1);
			assert.strictEqual(plan.updates.length, 1);
			assert.strictEqual(
				plan.updates[0].updatedContent,
				'![Before](image/after.png#preview)'
			);
		});
	});

	test('automatic folder moves coordinate moved documents and their images', async () => {
		await withTemporaryFolder(async root => {
			const sourceFolder = path.join(root, 'section');
			const destinationFolder = path.join(root, 'archive');
			const page = path.join(sourceFolder, 'page.md');
			const image = path.join(sourceFolder, 'image', 'diagram.png');
			await fs.mkdir(path.dirname(image), { recursive: true });
			await fs.writeFile(page, '![Diagram](image/diagram.png)');
			await fs.writeFile(image, 'image');

			const [documentMoves, imageMoves] = await Promise.all([
				expandMarkdownPathMove(sourceFolder, destinationFolder),
				expandImagePathMove(sourceFolder, destinationFolder)
			]);
			const plan = await planImageLinkUpdatesForMoves(
				imageMoves,
				documentMoves,
				root
			);

			assert.strictEqual(plan.linksUpdated, 0);
			assert.deepStrictEqual(plan.updates, []);
		});
	});
});

async function waitForDocumentText(document: vscode.TextDocument, expected: string): Promise<void> {
	const timeoutAt = Date.now() + 1000;
	while (document.getText() !== expected && Date.now() < timeoutAt) {
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}

async function withTemporaryFolder(run: (folder: string) => Promise<void>): Promise<void> {
	const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'caser-nest-images-'));
	try {
		await run(folder);
	} finally {
		await fs.rm(folder, { recursive: true, force: true });
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
