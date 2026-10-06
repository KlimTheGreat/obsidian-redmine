import { sanitizeHTMLToDom, TextFileView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TEXTILE } from './constants';
import { renderTextile } from './render';

/** View for .textile files: shows the rendered textile. */
export class TextileView extends TextFileView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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

	// Obsidian writes this back to disk when the tab closes — must stay identical to the input.
	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		this.render();
	}

	clear(): void {
		this.data = '';
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		const preview = this.contentEl.createDiv({ cls: 'redmine-textile-preview markdown-rendered' });
		// Parsed HTML only through Obsidian's sanitizer: drafts may hold raw <script>, on* handlers, javascript: links.
		preview.append(sanitizeHTMLToDom(renderTextile(this.data)));
		preview.addEventListener('click', onPreviewClick);
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
