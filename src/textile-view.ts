import { sanitizeHTMLToDom, setIcon, TextFileView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TEXTILE } from './constants';
import { TextileEditor } from './editor';
import { deferImageSources, enhancePreview, highlightCode } from './preview';
import { renderTextile } from './render';

export type TextileMode = 'preview' | 'live' | 'source';
export type EditMode = Exclude<TextileMode, 'preview'>;

const MODES: readonly TextileMode[] = ['preview', 'live', 'source'];

// Image types Obsidian can display; any other file found by name is not an image.
const IMAGE_EXTENSIONS = ['avif', 'bmp', 'gif', 'jpe', 'jpeg', 'jpg', 'png', 'svg', 'webp'];

/**
 * View for .textile files, modes like a markdown note: reading (Redmine preview) and editing, where editing is either
 * live preview (markup hidden off the cursor line) or source. The header button switches reading ↔ editing.
 */
export class TextileView extends TextFileView {
	mode: TextileMode = 'live';
	// Where the header button goes from reading: the editing mode used last.
	editMode: EditMode = 'live';
	// False between clear() and the next setViewData(): `data` then belongs to no file.
	private loaded = false;
	// Text the screen currently shows. Not `data`: Obsidian assigns `data` itself before calling setViewData().
	private shown: string | null = null;
	private editor: TextileEditor | null = null;
	private modeAction: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	onload(): void {
		super.onload();
		this.modeAction = this.addAction('book-open', 'Read', () => this.toggleMode());
		this.updateModeAction();
	}

	getViewType(): string {
		return VIEW_TYPE_TEXTILE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Textile';
	}

	getIcon(): string {
		return 'file-text';
	}

	// Obsidian writes this to disk on save — no normalization of any kind.
	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) this.clear();
		// Already on screen: keep the editor, its caret and scroll.
		if (this.loaded && data === this.shown) return;
		this.data = data;
		if (this.loaded && this.editor) {
			this.editor.setText(data);
			this.shown = data;
		} else {
			this.render();
		}
		this.loaded = true;
	}

	clear(): void {
		this.loaded = false;
		this.data = '';
		this.shown = null;
		this.destroyEditor();
		this.contentEl.empty();
	}

	// A requestSave() still pending after clear() would write '' into the file: skip saves until the next file loads.
	async save(clear?: boolean): Promise<void> {
		if (!this.loaded) return;
		await super.save(clear);
	}

	setMode(mode: TextileMode): void {
		if (mode === this.mode) return;
		const wasEditing = this.mode !== 'preview';
		this.mode = mode;
		if (mode !== 'preview') this.editMode = mode;
		this.updateModeAction();
		// Live preview ↔ source keeps the same editor: caret, scroll and undo history stay.
		if (wasEditing && mode !== 'preview' && this.editor) this.editor.setLive(mode === 'live');
		else this.render();
		this.app.workspace.requestSaveLayout();
	}

	/** Reading ↔ editing (in the editing mode used last). */
	toggleMode(): void {
		this.setMode(this.mode === 'preview' ? this.editMode : 'preview');
	}

	/** Live preview ↔ source; does nothing in reading mode. */
	toggleLivePreview(): void {
		if (this.mode !== 'preview') this.setMode(this.mode === 'live' ? 'source' : 'live');
	}

	// Obsidian keeps view state in the workspace layout: the mode survives restarts and file switches in this tab.
	getState(): Record<string, unknown> {
		return { ...super.getState(), mode: this.mode };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		// Apply the saved mode first, so the file loaded by super.setState() renders in it straight away.
		const mode = (state as { mode?: unknown } | null)?.mode;
		if (MODES.includes(mode as TextileMode)) this.setMode(mode as TextileMode);
		await super.setState(state, result);
	}

	private updateModeAction(): void {
		if (!this.modeAction) return;
		const action = this.mode === 'preview'
			? { icon: 'pencil', title: 'Edit' }
			: { icon: 'book-open', title: 'Read' };
		setIcon(this.modeAction, action.icon);
		this.modeAction.setAttribute('aria-label', action.title);
	}

	private render(): void {
		// Re-rendering the preview (a change on disk) keeps open collapses open: they're matched by position.
		const opened = Array.from(this.contentEl.querySelectorAll('details'), (details) => details.open);
		this.destroyEditor();
		this.contentEl.empty();
		this.shown = this.data;
		if (this.mode === 'preview') this.renderPreview(opened);
		else this.renderEditor();
	}

	private renderPreview(opened: boolean[]): void {
		const preview = this.contentEl.createDiv({ cls: 'redmine-textile-preview markdown-rendered' });
		let html: string;
		try {
			html = renderTextile(this.data);
		} catch (error) {
			// textile-js throws on some input (e.g. a NUL character); the source mode still shows the file.
			console.error('Redmine: could not render textile', error);
			preview.createEl('p', { cls: 'redmine-render-error', text: 'This file could not be rendered. Switch to editing to see and change it.' });
			return;
		}
		// Parsed HTML only through Obsidian's sanitizer: drafts may hold raw <script>, on* handlers, javascript: links.
		const content = sanitizeHTMLToDom(deferImageSources(html));
		enhancePreview(content, { resolveImage: (name) => this.resolveImage(name) });
		preview.append(content);
		preview.querySelectorAll('details').forEach((details, i) => {
			if (opened[i]) details.open = true;
		});
		preview.addEventListener('click', onPreviewClick);
		highlightCode(preview).catch((error) => console.error('Redmine: could not highlight code', error));
	}

	// An attachment name is looked up like a wikilink from this file: next to it first, then anywhere in the vault.
	private resolveImage(name: string): string | null {
		const file = this.app.metadataCache.getFirstLinkpathDest(name, this.file?.path ?? '');
		if (!file || !IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) return null;
		return this.app.vault.getResourcePath(file);
	}

	private renderEditor(): void {
		// The editor gets the file text as a CodeMirror document: text only, never parsed as HTML.
		this.editor = new TextileEditor(this.contentEl, this.data, {
			live: this.mode === 'live',
			onChange: (text) => {
				this.data = text;
				this.shown = text;
				this.requestSave();
			},
		});
	}

	private destroyEditor(): void {
		this.editor?.destroy();
		this.editor = null;
	}
}

// Links must not navigate Obsidian's own window: web and mail links open externally, the rest do nothing.
function onPreviewClick(evt: MouseEvent): void {
	const link = (evt.target as Element | null)?.closest('a');
	if (!link) return;
	evt.preventDefault();
	const href = link.getAttribute('href') ?? '';
	if (/^(https?|mailto):/i.test(href)) window.open(href, '_blank');
}
