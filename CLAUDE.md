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
- `src/textile-view.ts`: `TextileView extends TextFileView`. Obsidian reads the file and passes the text to `setViewData(data, clear)`, where `clear: true` means a different file was opened in the same leaf. On close, Obsidian writes `getViewData()` back to disk. `requestSave()` saves after a 2 s debounce.
- `src/constants.ts`: `VIEW_TYPE_TEXTILE = 'redmine-textile'`, `TEXTILE_EXTENSIONS`.
- `tests/mocks/obsidian.ts`: the `obsidian` npm package ships types only, so vitest aliases `obsidian` to this hand-written runtime mock. `tests/`, `scripts/` and `vitest.config.ts` are outside `tsconfig` and in the ESLint `globalIgnores`.

Stage roadmap: (1) open `.textile` as raw source (done) → (2) render with `textile-js`, preview ↔ source toggle, edit in a `<textarea>` + `requestSave()` → (3) Redmine macros before or after the parser: `{{collapse(Title) … }}` → `<details>`, `{{thumbnail(file.png, size=…)}}` → `<img>` via `app.vault.getResourcePath`, `#123456` → issue link. Check how `textile-js` handles colspan tables `|\4=.` and `<pre>` nested in collapse → (4) settings (Redmine URL, default mode) → (5) Redmine REST API (`PUT /issues/<id>` with `notes`).

## Rules

- `id` is `redmine` and must never change: it becomes the users' plugin folder name, and catalog ids can't contain `obsidian`. The display name `Redmine` doesn't contain "Obsidian" either.
- The view never alters file content on its own. `getViewData()` returns exactly what it got, byte for byte, including BOM, `\r\n` and trailing whitespace, because closing the tab writes it to disk.
- File text reaches the DOM only as text (`text`/`textContent`). Parsed HTML goes through `sanitizeHTMLToDom`, never `innerHTML`.
- When `src/` starts using a new Obsidian API, add it to `tests/mocks/obsidian.ts`.
- UI strings are English, sentence case (enforced by the `obsidianmd` lint rules).
- `isDesktopOnly: false`, so don't use Node or Electron APIs in `src/`.

## Obsidian vault: project knowledge base

Project notes live in the vault at `~/Dropbox/Second Brain/Projects/obsidian-redmine/`. They're plain markdown, so read and write them with the normal file tools. **Before reading or writing any note, read `~/Dropbox/Second Brain/Projects/CLAUDE.md`**: it defines folder layout, file names and frontmatter. The entry point is `Projects/obsidian-redmine/obsidian-redmine.md` (stages, analysis, doc links). Stage plans are in `plans/`, named `obsidian-redmine-NN-<name>`. Record each stage's results in the main note's `## Итоги` section.

- Real test data: about 10 drafts at `~/Dropbox/Second Brain/Oggetto/Prosv/*/comments/*.textile`. After manual testing, check with `git -C "<vault>" status --short Oggetto` that the plugin didn't modify any of them.
- The vault is its own git repo. `.obsidian/plugins/redmine/` must be in the vault's `.gitignore`. After vault changes, commit the vault with `git add` on specific paths.
