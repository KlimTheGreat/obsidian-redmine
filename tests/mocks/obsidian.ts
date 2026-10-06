// Minimal runtime stand-in for the `obsidian` module (the real package ships only types).
// Covers exactly the API surface the plugin uses; extend when the plugin starts using more.

import DOMPurify from 'dompurify';

type DomElementInfo = { text?: string; cls?: string };

declare global {
	interface HTMLElement {
		empty(): void;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomElementInfo): HTMLElementTagNameMap[K];
		createDiv(o?: DomElementInfo): HTMLDivElement;
	}
}

HTMLElement.prototype.empty = function (this: HTMLElement) {
	this.replaceChildren();
};

HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
	this: HTMLElement,
	tag: K,
	o?: DomElementInfo,
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (o?.text !== undefined) el.textContent = o.text;
	if (o?.cls) el.className = o.cls;
	this.appendChild(el);
	return el;
};

HTMLElement.prototype.createDiv = function (this: HTMLElement, o?: DomElementInfo): HTMLDivElement {
	return this.createEl('div', o);
};

// Obsidian sanitizes with DOMPurify too, so tests see the same stripping as the app.
export function sanitizeHTMLToDom(html: string): DocumentFragment {
	return DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
}

export class TFile {
	constructor(public path: string) {}
	get basename(): string {
		const name = this.path.split('/').pop() ?? '';
		const dot = name.lastIndexOf('.');
		return dot > 0 ? name.slice(0, dot) : name;
	}
	get extension(): string {
		const name = this.path.split('/').pop() ?? '';
		const dot = name.lastIndexOf('.');
		return dot > 0 ? name.slice(dot + 1) : '';
	}
}

export class WorkspaceLeaf {}

export function setIcon(parent: HTMLElement, iconId: string): void {
	parent.dataset.icon = iconId;
}

export class Workspace {
	layoutSaves = 0;
	requestSaveLayout(): void {
		this.layoutSaves++;
	}
}

export class App {
	workspace = new Workspace();
}

export class TextFileView {
	data = '';
	file: TFile | null = null;
	app = new App();
	contentEl: HTMLElement = document.createElement('div');
	actionsEl: HTMLElement = document.createElement('div');
	saveRequests = 0;
	savedData: string[] = [];
	requestSave: () => void = () => {
		this.saveRequests++;
	};
	constructor(public leaf: WorkspaceLeaf) {}
	onload(): void {}
	getViewData(): string {
		return this.data;
	}
	// The real save() writes getViewData() to the file; the mock records what would be written.
	async save(_clear?: boolean): Promise<void> {
		this.savedData.push(this.getViewData());
	}
	addAction(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
		const el = this.actionsEl.createEl('button');
		el.setAttribute('aria-label', title);
		setIcon(el, icon);
		el.addEventListener('click', (evt) => callback(evt));
		return el;
	}
}

export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Plugin {
	views = new Map<string, (leaf: WorkspaceLeaf) => unknown>();
	extensions = new Map<string, string>();
	registerView(type: string, creator: (leaf: WorkspaceLeaf) => unknown): void {
		this.views.set(type, creator);
	}
	registerExtensions(exts: string[], type: string): void {
		for (const ext of exts) {
			if (this.extensions.has(ext)) throw new Error(`Attempting to register an existing file extension "${ext}"`);
			this.extensions.set(ext, type);
		}
	}
}
