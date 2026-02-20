# caser README

This is the README for extension "caser" v 1.0.31

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

**dimmableMatches** defines whether to dim lines matching tag definitions in the current language. This is used by the `to-Dimmed` command. This is an array of strings: each string starts with the target language id (e.g. `markdown` or `sql`) followed by one or more regex expressions, all seperated with colons. For example, to dim lines with `<pre` or `pre>` tags in markdown, you would set the property to: `markdown:<pre:pre>`. To dim lines with `--` in SQL, you would set the property to: `sql:--`. Only one string per language, but multiple regex expressions are supported.

**regexPatterns** lists useful regex patterns for use by the `Select by Regex` function.

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

| key      | method            |notes         | 
| --------- | --------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `cs E`    | to-Escaped       (l)  |                                                                                             |                                     | 
| `as E`    | to-UnEscaped     (l)  |                                                                                             |                                     | 
| `as P`    | to-Pad           (l)  | Pads with spaces to widest part of selection and selects each line                          |                                     | 
| `as |`    | to-Pipe-or-Comma      | Toggles pipes or commas based on first in first line                                        |                                     | 
| `as T`    | to-Trim          (l)  | Trims trailing spaces and selects each line                                                 |                                     | 
| `as C`    | to-Compact       (l)  | removes most white space including newlines                                                 |                                     | 
| `as <`    | to-leading       (l)  | pushes a comma-separated list to leading commas multiline                                   |                                     | 
| `as >`    | to-trailing      (l)  | pushes a comma-separated list to training commas multiline                                  |                                     | 
| `as R`    | to-Select-by-Regex  s | elects based on regex                                                                       |                                     | 
| `as N`    | as New Line      (w)  | place each selection on a new line                                                          |                                     | 
| `as D`    | to-Dimmed             | toggles dimming on any line matched in the dimmableMatches setting for the current language |                                     | 
| `a N`     | to-numeric-sequence   | inserts or replaces trailing numbers in-line in the sequence selected                       | starting with the first number or 1 |
| `a O`     | to-Ordered            | orders a selected block by line alphabetically                                              |                                     | 
| `a D`     | to-ditto              | copies the item above word by word                                                          |                                     | 
| `a H`     | to-Hierarchy          | draws tree characters representing a hierarchy                                              |                                     | 
| `a T`     | to-table              | converts csv to a markdown table                                                            |                                     | 
| `a #`     | to-Header             | loops through header levels                                                                 |                                     | 
| `a enter` | to-continue-indented  | like ctrl+enter but replicates the current indent style and depth                           |                                     | 

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
| `ac F` | to-File     | Top line must have file link `[a](./filename.md)`| (this remains)   |
|        |             |                      - the rest moves to that file, link remains.   |
|        |             |      - Repeat to append to file. File is opened and updated.        |

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
