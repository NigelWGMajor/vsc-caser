# caser README

This is the README for extension "caser" v 1.0.46

## Building and Running

### Development
- `npm install` - Install dependencies
- `npm run compile` - Build the extension using webpack (development mode)
- `npm run watch` - run packageontinuous compilation during development
- `npm run check-types` - Run TypeScript type checking without compilation

### Packaging
- Update version in `package.json`
- `npm run package` - Build optimized production bundle
- `npx vsce package` - Create .vsix extension package


### Testing
- Press F5 in VS Code to launch Extension Development Host
- The extension will be loaded from `./dist/extension.js` (bundled output)

## Features

This is a text editor extension providing enhanced text editing. Multiple selections are usually accepted: where noted, defaults will be applied when there is no selection: w: defaults to current word l: defaults to current line 

Suggested keybindings:
|abb|modifiers     | group      | general usage                    |
|---|--------------|------------|----------------------------------|
|cs | ctrl + shift |      common|most simple formatting changes    |
|as | alt  + shift |      alt   |more complex changes, some undos  | 
|ac | alt  + ctrl  |  organizing| marking, cycling and moving      |

## caser Properties

**dimActive** controls whether configured matches are dimmed. It defaults to `true`, persists in VS Code's user settings, and is toggled by the `to-Dimmed` command.

**updateDocumentLinksOnMove** controls automatic Markdown link maintenance for files and folders renamed or moved in the VS Code Explorer. It defaults to `true`. When enabled, Caser updates links inside moved Markdown documents, inbound links from other Markdown documents, and inbound Markdown image references for moved images.

**maximumWidthOfColumnsInTables** controls the maximum cell width used by `to-WrappedColumns` and defaults to `50`. Text wraps onto padded continuation rows. URLs are never split; a URL longer than the configured width is placed on its own continuation row.

**dimmableMatches** defines which text ranges to dim in the current language. This is an array of strings: each string starts with the target language id (e.g. `markdown` or `sql`) followed by one or more regex expressions, all seperated with colons. For example, to dim lines with `<pre` or `pre>` tags in markdown, you would set the property to: `markdown:<pre:pre>`. To dim lines with `--` in SQL, you would set the property to: `sql:--`. Only one string per language, but multiple regex expressions are supported.

The general form is:

```text
languageId:regex1:regex2:regex3
```
Note:

- `languageId` must match VS Code’s language id exactly, like `markdown`, `sql`, `typescript`.
- Do **not** wrap regexes in `/.../g`; the extension does `new RegExp(pattern, 'g')`.
- if editing the json directly, backslashes *must* be doubled: use `\\s`, `\\b`, `\\d`, etc.
- if editing using the settings dialog, do not escape, as this will occur automatically.
- Multiple regexes are separated with `:`, so avoid regexes that need a literal colon
- The current implementation dims the matched text range. If you want the whole line dimmed, make the regex match the whole line.

Examples:

```json
"caser.dimmableMatches": [
  "markdown:<\\/?pre\\b[^>]*>:<\\/?code\\b[^>]*>",
  "sql:^\\s*--.*$",
  "typescript:^\\s*//.*$"
]
```

For markdown HTML tags generally, this is a good test pattern:

```text
markdown:<\\/?[A-Za-z][^>]*>
```

For SQL comment lines:

```text
sql:^\\s*--.*$
```

**regexPatterns** lists useful regex patterns for use by the `Select by Regex` function.

**fences** defines the language identifiers cycled by `to-Fence`. The first entry is used when wrapping selected text or inserting a new empty fenced block. The default is `cs`, `json`, `sql`, `ps`, `yaml`, `html`, `css`, and `mermaid`.

**quickRefPath** specifies the absolute path to a PDF file for quick reference access. If not set, defaults to `quick-reference.pdf` in the VSCode User folder (`%APPDATA%\Code\User\` on Windows, `~/.config/Code/User/` on Linux, `~/Library/Application Support/Code/User/` on macOS).

**dotIcons, squareIcons, numberIcons, stepIcons, queryIcons, refIcons, warnIcons, linkIcons, userIcons**

These define the symbols or icons to be used by the various marking functions.

### Exchange
|key     |method   |notes               |
| ------ | ------- | ------------------ |
| `cs X` | to-Swap | Is context driven: |

|Context| Effect|
|--|--|
Cursor between words, no selection| Exchanges the surrounding words if on the same line
Selected word(s)| Exchanges the word before and the word after
In a word, no selection| Exchanges the letters before and after the cursor
In a word, letters selected| Exchanges the start of the word and the end, eaving the selected portion intact

### Casing/pathing:
| key      | method            |notes         |
| -------- | ----------------- | ------------ |
| `cs U`   | to-UpperCase  (w) | `UPPER CASE` |
| `cs L`   | to-LowerCase  (w) | `lower case` |
| `cs T`   | to-TitleCase  (w) | `Title Case` |
| `cs C`   | to-CamelCase  (w) | `camelCase`  |
| `cs S`   | to-SnakeCase  (w) | `snake_case` |
| `cs K`   | to-KebabCase  (w) | `kebab-case` |
| `cs P`   | to-PascalCase (w) | `PascalCase` |
| `cs ' '` | to-SpaceCase  (l) | `space case` |
| `cs \`   | to-Dos-Slash  (l) | `.\path\`    |
| `cs /`   | to-Unix-Slash (l) | `./path/`    |

### Quoting and wrapping
   
| key      | method            |notes         |
| ------- | ------------------ | --- |
| `cs "`  | to-Quoted      (l) |     |
| `cs '`  | to-SQuoted     (l) |     |
| `c bt ` | to-BackTick    (l) |     |
| `as "`  | to-UnQuoted    (l) |     |
| `as '`  | to-UnSQuoted   (l) |     |
| `as bt` | to-UnBackTick  (l) |     |
| `cs {`  | to-Curly       (l) | {   |
| `cs }`  | to-NoCurly     (l) | }   |
| `cs <`  | to-Angle       (w) | <   |
| `cs >`  | to-NoAngle     (w) | >   |
| `cs (`  | to-Parens      (l) | (   |
| `cs )`  | to-NoParens    (l) | )   |
| `cs [`  | to-Square      (l) | [   |
| `cs ]`  | to-NoSquare    (l) | ]   |
| `cs *`  | to-Star        (w) | * * |
| `cs _`  | to-UnderScore  (w) | _ _ |
| `cs ~`  | to-Tilde       (l) | ~ ~ |
| `as sp` | to-None        (l) |     |

### Formatting and selection   

| key       | method                |notes                                                                                        |                                     |
| --------- | --------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `cs E`    | to-Escaped       (l)  |                                                                                             |                                     | 
| `as E`    | to-UnEscaped     (l)  |                                                                                             |                                     | 
| `as P`    | to-Pad           (l)  | Pads with spaces to widest part of selection and selects each line                          |                                     | 
| `as \|`   | to-Pipe-or-Comma      | Toggles pipes or commas based on first in first line                                        |                                     | 
| `as T`    | to-Trim          (l)  | Trims trailing spaces and selects each line                                                 |                                     | 
| `as C`    | to-Compact       (l)  | removes most white space including newlines                                                 |                                     | 
| `as <`    | to-leading       (l)  | pushes a comma-separated list to leading commas multiline                                   |                                     | 
| `as >`    | to-trailing      (l)  | pushes a comma-separated list to training commas multiline                                  |                                     | 
| `as R`    | to-Select-by-Regex  s | elects based on regex                                                                       |                                     | 
| `as N`    | as New Line      (w)  | place each selection on a new line                                                          |                                     | 
|  `a M`    | to-Multiple      (l)  | repeats selection inline, or current line when nothing is selected                          |                                     | 
| `as D`    | to-Dimmed             | toggles dimming on any line matched in the dimmableMatches setting for the current language |                                     | 
| `a N`     | to-numeric-sequence   | inserts or replaces trailing numbers in-line in the sequence selected                       | starting with the first number or 1 |
| `a O`     | to-Ordered            | orders a selected block by line alphabetically                                              |                                     | 
| `a D`     | to-Ditto              | copies the item above word by word                                                          |                                     | 
| `a H`     | to-Hierarchy          | draws tree characters representing a hierarchy                                              |                                     | 
|            | to-EscapedCsv         | replaces newlines inside quoted CSV fields with `\n`, keeping each CSV record on one line    |                                     |
| `a T`     | to-Table              | converts CSV to a Markdown table and automatically escapes quoted multiline fields           |                                     |
|            | to-WrappedColumns     | wraps Markdown table cells at the configured width (default 50) without splitting URLs        |                                     |
|            | to-UnwrappedColumns   | joins wrapped continuation rows back into their original Markdown table rows                  |                                     |
| `a #`     | to-Header             | loops through header levels                                                                 |                                     | 
| `a enter` | to-Continue-indented  | like ctrl+enter but replicates the current indent style and depth  
| `a -`     | to-Indent             | rotate through levels of indented bullet                        || 
| `a /`     | to-Line-Comment       | insert special ad-hoc line comment non-destructively in markdown
|           | to-Fence              | wrap text in a fenced block, insert an empty block, or cycle its language
### Dummy text

| key    | method     |
| ------ | ---------- |

| `as L` | LoremIpsum |

### Encryption
| key    | method  | notes                                                |
| ------ | ------- | ---------------------------------------------------- |
| `cs ?` | to-Flip | (uses local environment variable VSCODE_KEY as seed) |

- Switches between encrypted and clear

### Organization and marking (Markdown only!)

The symbol sets can be edited in the settings.json file. When a symbol is placed, subsequent uses of the same key will cycle through the symbols in that set. 

- Query, Line and Step marking is typically used to show status of lines and will step over indents.
- Ref, Warn and User symbols can be used anywhere in a line for emphasis or clarification 
- Numbers can be inserted anywhere, usiually for traige or organization
- Link symbols insert templates for file, heading or url links


| key    | method      | notes                         | range                              |
| ------ | ----------- | ----------------------------- | ---------------------------------- |
| `ac Q` | markQuery   | ❓⁉️❌❗‼️🛑                 |                                    |
| `ac M` | markline    | 🟥🟨🟩🟦✅❎ <-- if a header | These are bound to                 |
| `ac M` | Markline    | 🔴🟡🟢🔵✔️✖️ <-- otherwise   | the start of a line                |
| `ac S` | markStep    | 💭🔎👋💡🚧🎁                 | (state markers)                    |
| `ac R` | markRef     | 🎟️🔀⚗️📚📆🔒                 |                                    |
| `ac W` | markWarn    | 💥⚠️🪲🩹⏳📌                 | These can be placed anywhere       |
| `ac U` | markUser    | 👬😁😞🤷‍♂️🕊️🎗️                 | (landmarks)                        |
| `ac N` | markNumber: | 0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟      |                                    |
| `ac L` | markLink    | [🔗]() [🔖](#)  [🎟️]()  [🔀]()  [ℹ️]()  [⏪]()  [⏩]()            |
| `ac P` | to-End      | pushes content to end         | If starts with a header             |
|        |             |                               |that is moved and a link inserted.   |
| `ac F` | to-File     | First use prompts for a workspace-relative filename or path.        |
|        |             | The selection (or current line) moves to that file.                  |
|        |             | Later uses append to the same file for the current VS Code session.  |
|        | to-Anchor   | Inserts `<a id="ref-N"></a>` before line N and copies a link such as `[ref-N](./path/file.md#ref-N)`. |

### Nested images

The nested-image commands keep Markdown images beside their documents in an `image` folder.

| method | where it runs | behavior |
| ------ | ------------- | -------- |
| `to-PasteNestedImage` | Markdown editor | `Ctrl+V`/`Cmd+V` saves a pasted image in the document's `image` folder and inserts its Markdown reference. Selected text becomes the image title and lower-kebab filename; ordinary text paste still works normally. |
| `to-NestImages` | Explorer context menu for one or more Markdown files | Finds their local image references, moves images into the adjacent `image` folder when needed, repairs resolvable paths, and marks broken references. |
| `to-WhereUsedLocally` | Explorer context menu for one or more image files | Selects Markdown documents in the image folder or any parent folder up to the workspace root that reference the selected image(s). If no references are found, the original image selection is restored in Explorer so the unused images can be deleted. |
| `to-UnusedImages` | Explorer context menu for one or more selected image files | Scans each image for references in its own folder and parent folders up to the workspace root. Referenced images are deselected, leaving only unused images selected for easy deletion. |

`to-WhereUsedLocally` resolves exact inline and reference-style Markdown image paths, including URL-encoded paths and query or fragment suffixes. It does not treat a plain filename mention as a reference, and it does not search sibling or descendant folders.

### Document links

The document-link commands help recover links after Markdown files move and identify documents with no inbound links.

| method | where it runs | behavior |
| ------ | ------------- | -------- |
| `to-RepairDocumentLinks` | Explorer context menu for one or more Markdown files | Checks local links to other Markdown documents. Existing targets are left alone, uniquely identifiable moved targets are relinked with anchors and query strings preserved, and unresolved or ambiguous links are marked with `⛓️‍💥` in their label. |
| `to-UnreferencedDocuments` | Explorer context menu for one or more selected Markdown files | Scans Markdown links throughout the workspace, deselects documents referenced by another document, and leaves only unreferenced documents selected for review or deletion. Self-links do not count as inbound references. |
| `to-NewDocumentLocation` | Explorer context menu for a single Markdown file | Prompts for a new workspace path, moves the document, rewrites its working relative Markdown links for the new folder, and updates links in other workspace documents that referenced its old location. |

Repair uses the original filename and path tail to locate a moved document. A unique filename is repaired automatically; when duplicate filenames make the target uncertain, the link is marked broken instead of guessing. External links, heading-only links, image links, and links to non-Markdown files are ignored.

With **Caser > Update Document Links On Move** enabled, the same link maintenance runs automatically when Markdown documents, images, or folders containing them are renamed or dragged to a new location in the VS Code Explorer. Document links are recalculated in both directions, and exact inbound Markdown image references follow renamed or moved images. Folder moves are handled as one coordinated operation so links between files that move together remain stable. Moves made outside VS Code do not trigger this behavior.

### Bucketed save/load

`Save-To-Bucket` (`caser.saveToBucket`) saves the active editor contents through the standard Save dialog, but defaults the dialog to the last folder you selected or to the current bucket folder inside `<workspace>/.data`. `Load-From-Bucket` (`caser.loadFromBucket`) opens a file using the same bucket-aware default directory so you can wire both commands to convenient keys.

Buckets are created automatically based on the **Caser > Bucket Span** setting (default `week`). The bucket folder name depends on the chosen span:

| Span Name | format       | notes                             | 
| --------- | ------------ | --------------------------------- |
| day       | `YYYY-mm-dd` |                                   |
| week      | `YYYY-mm-dd` | (first day of the week is Sunday) |
| month     | `YYYY-mm`    |                                   |
| quarter   | `YYYYQn`     |                                   |
| year      | `YYYY`       |                                   |

| key         | method      | notes                                       |
| ----------- | ----------- | ------------------------------------------- |
| `acs enter` | to Terminal | pushes the one line at a time to the shell. |
- is wrapped in `cmd /k` and `exit`
- all forward slashes are converted to backslashes.
- surrounding backticks are removed

| key        | method                                  |
| ---------- | --------------------------------------- |
| `acs b`    | to Bash like above but uses bash shell. |
| `cs enter` | to Powershell command                   |

### Quick Reference

| key   | method          |notes                                                 |
| ------| ----------------|----------------------------------------------------- |
| `a Q` |`show-quick-ref` | Opens a PDF file in the vscode default PDF viewer for quick reference. |
- Configure the PDF path in Settings > Caser > Quick Ref Path
- If not configured, looks for `quick-reference.pdf` in the VSCode User folder
- Useful for keeping documentation, keyboard shortcuts, or other reference materials readily accessible

### Triage

| key               | method                                  | notes                                      |
| ----------------- | --------------------------------------- | ------------------------------------------ |
| `triage-filename` | is used to step through a list of files | typically for traige or checking purposes. |

Starting at the first line in the file, when triggered:

- any filename on that line will be pasted into the command bar to allow searching
- the row will be moved above an empty line so that it is easy to keep track of
- the next filename will be selected
