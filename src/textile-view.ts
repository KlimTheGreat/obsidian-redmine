import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TEXTILE } from './constants';

/** Read-only view for .textile files: shows the raw source as plain text. */
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
		// `text` sets textContent: HTML from the file is shown, never parsed.
		this.contentEl.createEl('pre', { text: this.data, cls: 'redmine-textile-source' });
	}
}
