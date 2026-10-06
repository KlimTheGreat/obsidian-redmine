import { sanitizeHTMLToDom, setIcon, TextFileView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TEXTILE } from './constants';
import { renderTextile } from './render';

export type TextileMode = 'preview' | 'source';

/** View for .textile files: rendered preview or editable source, switched from the tab header. */
export class TextileView extends TextFileView {
	mode: TextileMode = 'preview';
	// False between clear() and the next setViewData(): `data` then belongs to no file.
	private loaded = false;
	// textarea turns \r\n into \n; edits of a CRLF file are written back with \r\n.
	private lineBreak = '\n';
	// Text the screen currently shows. Not `data`: Obsidian assigns `data` itself before calling setViewData().
	private shown: string | null = null;
	private editor: HTMLTextAreaElement | null = null;
	private modeAction: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	onload(): void {
		super.onload();
		this.modeAction = this.addAction('pencil', 'Edit source', () => this.toggleMode());
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
		// Already on screen: keep the textarea, its caret and scroll.
		if (this.loaded && data === this.shown) return;
		this.data = data;
		this.lineBreak = data.includes('\r\n') ? '\r\n' : '\n';
		if (this.loaded && this.editor) this.replaceEditorText(this.editor, data);
		else this.render();
		this.loaded = true;
	}

	clear(): void {
		this.loaded = false;
		this.data = '';
		this.shown = null;
		this.editor = null;
		this.contentEl.empty();
	}

	// A requestSave() still pending after clear() would write '' into the file: skip saves until the next file loads.
	async save(clear?: boolean): Promise<void> {
		if (!this.loaded) return;
		await super.save(clear);
	}

	setMode(mode: TextileMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		this.updateModeAction();
		this.render();
		this.app.workspace.requestSaveLayout();
	}

	toggleMode(): void {
		this.setMode(this.mode === 'preview' ? 'source' : 'preview');
	}

	// Obsidian keeps view state in the workspace layout: the mode survives restarts and file switches in this tab.
	getState(): Record<string, unknown> {
		return { ...super.getState(), mode: this.mode };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		// Apply the saved mode first, so the file loaded by super.setState() renders in it straight away.
		const mode = (state as { mode?: unknown } | null)?.mode;
		if (mode === 'preview' || mode === 'source') this.setMode(mode);
		await super.setState(state, result);
	}

	private updateModeAction(): void {
		if (!this.modeAction) return;
		const action = this.mode === 'preview'
			? { icon: 'pencil', title: 'Edit source' }
			: { icon: 'book-open', title: 'Show preview' };
		setIcon(this.modeAction, action.icon);
		this.modeAction.setAttribute('aria-label', action.title);
	}

	private render(): void {
		this.contentEl.empty();
		this.editor = null;
		this.shown = this.data;
		if (this.mode === 'source') this.renderSource();
		else this.renderPreview();
	}

	private renderPreview(): void {
		const preview = this.contentEl.createDiv({ cls: 'redmine-textile-preview markdown-rendered' });
		// Parsed HTML only through Obsidian's sanitizer: drafts may hold raw <script>, on* handlers, javascript: links.
		preview.append(sanitizeHTMLToDom(renderTextile(this.data)));
		preview.addEventListener('click', onPreviewClick);
	}

	private renderSource(): void {
		const editor = this.contentEl.createEl('textarea', { cls: 'redmine-textile-source' });
		// `value`, not markup: the file text never gets parsed as HTML.
		editor.value = this.data;
		editor.spellcheck = false;
		editor.addEventListener('input', () => {
			this.data = this.lineBreak === '\n' ? editor.value : editor.value.replace(/\n/g, '\r\n');
			this.shown = this.data;
			this.requestSave();
		});
		this.editor = editor;
	}

	// File changed on disk while editing: swap the text, keep the caret where it was (clamped to the new length).
	private replaceEditorText(editor: HTMLTextAreaElement, data: string): void {
		const { selectionStart, selectionEnd } = editor;
		editor.value = data;
		this.shown = data;
		editor.setSelectionRange(Math.min(selectionStart, editor.value.length), Math.min(selectionEnd, editor.value.length));
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
