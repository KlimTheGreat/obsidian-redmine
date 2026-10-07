# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Obsidian community plugin **Redmine**: view and edit Redmine `.textile` files (comment drafts in the vault's `comments/` folders) inside Obsidian, later full Redmine integration. Scaffolded from `obsidianmd/obsidian-sample-plugin` (TypeScript + esbuild). Its `AGENTS.md` has agent conventions for Obsidian plugins.

## Commands

- `npm test`: unit tests (vitest + jsdom). Single file: `npm test -- tests/main.test.ts`; single test: add `-t "<name>"`.
- `npm run build`: `tsc` type-check of `src/` + esbuild bundle to `main.js`
- `npm run lint`: ESLint with `eslint-plugin-obsidianmd`
- `npm run dev`: esbuild watch
- `OBSIDIAN_VAULT="/home/kyaschenko/Dropbox/Second Brain" npm run install-vault`: build and **copy** `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/redmine/`. It copies instead of symlinking because Dropbox doesn't sync symlinks that point outside Dropbox. After a rebuild, toggle the plugin off and on in Obsidian, or use "Reload app without saving".
- npm 10.9.2 crashes on peer deps (`Cannot read properties of null (reading 'edgesOut')`). `.npmrc` must contain `legacy-peer-deps=true`.

## Architecture

- `src/main.ts`: `RedminePlugin` calls `registerView(VIEW_TYPE_TEXTILE, …)` and `registerExtensions(['textile'], VIEW_TYPE_TEXTILE)`. If another plugin already owns `.textile`, `registerExtensions` throws. The plugin catches the error, shows a `Notice` and keeps loading. Obsidian unregisters both calls on unload, so there's no `onunload`.
- `src/textile-view.ts`: `TextileView extends TextFileView` with modes like a markdown note: `'preview'` (reading: the Redmine preview), `'live'` (live preview, the default for a new tab) and `'source'`. The header button (`addAction`) and the `toggle-textile-mode` command switch reading ↔ editing; editing comes back in the mode used last (`editMode`). `toggle-live-preview` switches live ↔ source on the same editor, so the caret and undo history stay.
  - Preview: `renderTextile()` → `sanitizeHTMLToDom` → `.redmine-textile-preview.markdown-rendered`. Link clicks are intercepted: `http(s)`/`mailto` go to `window.open`, everything else is cancelled so Obsidian's window never navigates. If `renderTextile` throws (textile-js does on a NUL char), the preview shows an error line instead. Re-rendering keeps open `<details>` open, matched by position.
  - Editing: a `TextileEditor` (below). Each edit updates `this.data` and calls `requestSave()`, which saves after a 2 s debounce. Leaving editing destroys the editor; its undo history doesn't survive reading mode.
  - `setViewData(data, clear)`: `clear: true` means another file was opened in the tab. Obsidian assigns `this.data` itself *before* calling `setViewData` (and drops the echo of our own save), so the view compares incoming text with what it shows (`shown`), never with `data`. An external change while editing goes to `TextileEditor.setText()`.
  - `save()` is skipped between `clear()` and the next `setViewData()`, so a late `requestSave()` can't write `''`. Obsidian's unload path (`save(true)`) calls `clear()`, which destroys the editor.
  - The mode is stored in `getState()`/`setState()`, i.e. in the workspace layout, so it persists per tab.
- `src/editor.ts`: `TextileEditor`, a CodeMirror 6 `EditorView`. `@codemirror/*` comes from Obsidian at runtime (esbuild keeps it external); the devDependencies are pinned to the `obsidian` package's peer versions, only for types and tests.
  - `EditorState.lineSeparator` is the file's own break (`\r\n` if the file has one, else `\n`), so a stray break of the other kind stays a character. Read the text with `state.sliceDoc()`; `doc.toString()` always joins with `\n`. A `transactionFilter` turns line breaks in pasted or dropped text into the file's kind.
  - `setText()` (change on disk) dispatches one minimal replace annotated `fromDisk`: kept out of undo history and not reported to `onChange`. If the file switched between LF and CRLF, the state is recreated.
  - The host div carries Obsidian's editor classes (`markdown-source-view cm-s-obsidian mod-cm6`, `is-live-preview`), so the theme lays it out like a note editor.
- `src/render.ts`: `renderTextile(source)` → unsanitized HTML. Strips a leading BOM, renders CRLF as LF, then mirrors Redmine's pipeline (`application_helper.rb`):
  - known macros (`collapse`, `thumbnail`) are cut out into `redminemacroNe` placeholders before `textile-js` and put back after it;
  - inside `<pre>`/`<code>` a macro shows as written, and `!{{…}}` prints it as text;
  - `#123` at a line start is written as `&#35;123`, otherwise `textile-js` makes it `<ol start="123">`.
- `src/macros.ts`: ports of Redmine's `collapse` (→ `<details>`, show/hide labels split by commas like Redmine's `exec_macro`) and `thumbnail` (→ `<img>` with `max-width`/`max-height`, Redmine's error text for bad args).
- `src/preview.ts`: DOM pass over the sanitized fragment before it's attached:
  - `deferImageSources()` (string, before sanitizing) moves relative `<img src>` to `data-redmine-src`: the real `sanitizeHTMLToDom` `importNode`s into the live document, where a bare `src` would already be fetched. The name is then decoded like Redmine's `CGI.unescape` and resolved via `getFirstLinkpathDest` + `getResourcePath`, else replaced by a `.redmine-attachment` placeholder;
  - `#123` refs outside `pre`/`code`/`a` get `span.redmine-issue-ref[data-issue]`;
  - `<code class="sql">` gets `language-sql`, and `highlightCode()` runs Obsidian's Prism after attaching.
- `src/constants.ts`: `VIEW_TYPE_TEXTILE = 'redmine-textile'`, `TEXTILE_EXTENSIONS`.
- `tests/mocks/obsidian.ts`: the `obsidian` npm package ships types only, so vitest aliases `obsidian` to this hand-written runtime mock. Its `TextFileView` load/save lifecycle (`setData`, `loadFile` = `loadFileInternal`, `save`) and DOMPurify config are copied from Obsidian's `app.js` (`~/.config/obsidian/obsidian-<ver>.asar`). Test opening, external changes and saving through `loadFile()`/`save()`, not by calling `setViewData` directly. `tests/`, `scripts/` and `vitest.config.ts` are outside `tsconfig` and in the ESLint `globalIgnores`. `tests/setup-dom.ts` gives `Range` empty rects: jsdom has no layout and CodeMirror measures text.

Stage roadmap: (1) open `.textile` as raw source (done) → (2) render with `textile-js`, preview ↔ source toggle, edit in a `<textarea>` + `requestSave()` (done) → (3) Redmine macros and markup: collapse, thumbnail, inline images from the vault, issue-ref marks, Prism highlighting (done) → (4) combined live-preview mode like markdown's: own CodeMirror 6 editor (Obsidian exposes `@codemirror/*`, already external in esbuild) with textile highlighting, then decorations hiding markup off the cursor line, then block widgets for tables/`<pre>`/collapse → (5) settings (Redmine URL → turn `.redmine-issue-ref` marks into links, default mode, readable line length) → (6) Redmine REST API (`PUT /issues/<id>` with `notes`).

## Rules

- Language: reply to the owner in English, and write plans, commits and repo docs in English. Existing Russian vault notes stay Russian; additions to them follow the note's language.
- `id` is `redmine` and must never change: it becomes the users' plugin folder name, and catalog ids can't contain `obsidian`. The display name `Redmine` doesn't contain "Obsidian" either.
- The view never alters file content on its own. `getViewData()` returns exactly what it got, byte for byte, including BOM, `\r\n` and trailing whitespace, because closing the tab writes it to disk.
- File text reaches the DOM only as text (`text`/`textContent`). Parsed HTML goes through `sanitizeHTMLToDom`, never `innerHTML`.
- The preview mirrors what Redmine will show, not what looks nicest. When `textile-js` and Redmine disagree, port Redmine's behaviour (sources: `redmine/redmine` `app/helpers/application_helper.rb`, `lib/redmine/wiki_formatting/macros.rb`).
- `document.createElement` is flagged by `obsidianmd/prefer-create-el`: use `createSpan`/`createEl` (mocked in `tests/mocks/obsidian.ts`). No regex lookbehind (`obsidianmd/regex-lookbehind`, iOS).
- When `src/` starts using a new Obsidian API, add it to `tests/mocks/obsidian.ts`.
- UI strings are English, sentence case (enforced by the `obsidianmd` lint rules).
- `isDesktopOnly: false`, so don't use Node or Electron APIs in `src/`.
- `minAppVersion` is `1.1.0` (needed for `addAction`). Check `@since` in `node_modules/obsidian/obsidian.d.ts` before using new API.
- CodeMirror: only APIs present in `@codemirror/*` 6.0.0 (check the package `CHANGELOG.md`): `minAppVersion` 1.1.0 ships an early CodeMirror 6. Never bundle `@codemirror/*` or add a second version: `npm ls @codemirror/state @codemirror/view` must show one copy each.
- `dompurify` is a dev dependency for the `sanitizeHTMLToDom` mock only. Never import it in `src/`.

## Git

- Base branch is `main`; remote `origin` is `github.com/KlimTheGreat/obsidian-redmine`.
- Each feature or stage gets its own branch off `main` (e.g. `stage-4`). Commit there, not on `main`.
- When the work is done and tests pass, merge it into `main` locally (`git merge --no-ff <branch>`), re-run `npm test` on the result, then delete the branch with `git branch -d`.
- Never push: the repo owner does that. No pull requests (personal repo).

## Obsidian vault: project knowledge base

Project notes live in the vault at `~/Dropbox/Second Brain/Projects/obsidian-redmine/`. They're plain markdown, so read and write them with the normal file tools. Move, rename and delete notes only via the Obsidian CLI (`obsidian vault="Second Brain" move path="…" to="…"`) so links stay intact; if it fails (Obsidian not running), stop and tell me, never `mv`/`rm` notes. **Before reading or writing any note, read `~/Dropbox/Second Brain/Projects/CLAUDE.md`**: it defines folder layout, file names and frontmatter. The entry point is `Projects/obsidian-redmine/obsidian-redmine.md` (stages, analysis, doc links). Stage plans are in `plans/`, named `obsidian-redmine-NN-<name>`. Record each stage's results in the main note's `## Итоги` section.

- Real test data: about 10 drafts at `~/Dropbox/Second Brain/Oggetto/Prosv/*/comments/*.textile`. After manual testing, check with `git -C "<vault>" status --short Oggetto` that the plugin didn't modify any of them.
- The vault is its own git repo. `.obsidian/plugins/redmine/` must be in the vault's `.gitignore`. After vault changes, commit the vault with `git add` on specific paths.
