// Minimal runtime stand-in for the `obsidian` module (the real package ships only types).
// Covers exactly the API surface the plugin uses; extend when the plugin starts using more.

import DOMPurify from 'dompurify';

type DomElementInfo = { text?: string; cls?: string; attr?: Record<string, string> };

declare global {
	interface HTMLElement {
		empty(): void;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomElementInfo): HTMLElementTagNameMap[K];
		createDiv(o?: DomElementInfo): HTMLDivElement;
		createSpan(o?: DomElementInfo): HTMLSpanElement;
	}
	interface Node {
		appendText(text: string): void;
	}
	function createSpan(o?: DomElementInfo): HTMLSpanElement;
}

function buildEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomElementInfo): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (o?.text !== undefined) el.textContent = o.text;
	if (o?.cls) el.className = o.cls;
	for (const [name, value] of Object.entries(o?.attr ?? {})) el.setAttribute(name, value);
	return el;
}

globalThis.createSpan = (o?: DomElementInfo) => buildEl('span', o);

Node.prototype.appendText = function (this: Node, text: string) {
	this.appendChild(document.createTextNode(text));
};

HTMLElement.prototype.empty = function (this: HTMLElement) {
	this.replaceChildren();
};

HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
	this: HTMLElement,
	tag: K,
	o?: DomElementInfo,
): HTMLElementTagNameMap[K] {
	return this.appendChild(buildEl(tag, o));
};

HTMLElement.prototype.createDiv = function (this: HTMLElement, o?: DomElementInfo): HTMLDivElement {
	return this.createEl('div', o);
};

HTMLElement.prototype.createSpan = function (this: HTMLElement, o?: DomElementInfo): HTMLSpanElement {
	return this.createEl('span', o);
};

// Same DOMPurify setup as Obsidian 1.14 (config and hook copied from app.js), so tests see the app's stripping.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node instanceof HTMLAnchorElement) {
		node.setAttribute('target', '_blank');
		if (!node.hasAttribute('rel')) node.setAttribute('rel', 'noopener nofollow');
	}
});

export function sanitizeHTMLToDom(html: string): DocumentFragment {
	return DOMPurify.sanitize(html, {
		ALLOW_UNKNOWN_PROTOCOLS: true,
		RETURN_DOM_FRAGMENT: true,
		FORBID_TAGS: ['style'],
		ADD_TAGS: ['iframe'],
		ADD_ATTR: ['frameborder', 'allowfullscreen', 'allow', 'sandbox', 'data-tooltip-position'],
		FORBID_ATTR: ['data-background-iframe'],
	});
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
	activeView: unknown = null;
	layoutSaves = 0;
	getActiveViewOfType<T>(type: new (...args: never[]) => T): T | null {
		return this.activeView instanceof type ? this.activeView : null;
	}
	requestSaveLayout(): void {
		this.layoutSaves++;
	}
}

export class Vault {
	/** Files that exist in the test vault; tests push into it. */
	files: TFile[] = [];
	getResourcePath(file: TFile): string {
		return `app://vault/${file.path}`;
	}
}

export class MetadataCache {
	constructor(private vault: Vault) {}
	// Real one resolves like a wikilink; the mock matches the full path or the file name.
	getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
		return this.vault.files.find((f) => f.path === linkpath || f.path.split('/').pop() === linkpath) ?? null;
	}
}

export class App {
	workspace = new Workspace();
	vault = new Vault();
	metadataCache = new MetadataCache(this.vault);
}

// Stands in for Obsidian's bundled Prism: records which elements it was asked to highlight.
export const prism = {
	highlighted: [] as Element[],
	highlightElement(element: Element): void {
		this.highlighted.push(element);
	},
};

export async function loadPrism(): Promise<typeof prism> {
	return prism;
}

export interface ViewStateResult {
	history: boolean;
}

// Load/save lifecycle copied from Obsidian 1.14's TextFileView (app.js): setData, loadFileInternal, save.
// Tests that exercise opening, external changes or saving go through loadFile()/save(), like the app does.
export class TextFileView {
	data = '';
	file: TFile | null = null;
	app = new App();
	contentEl: HTMLElement = document.createElement('div');
	actionsEl: HTMLElement = document.createElement('div');
	lastSavedData: string | null = null;
	dirty = false;
	saveRequests = 0;
	savedData: string[] = [];
	requestSave: () => void = () => {
		this.dirty = true;
		this.saveRequests++;
	};
	constructor(public leaf: WorkspaceLeaf) {}
	setViewData(_data: string, _clear: boolean): void {}
	clear(): void {}
	// Real setData assigns `data` BEFORE calling setViewData.
	setData(data: string, clear: boolean): void {
		if (this.data !== data || clear) {
			this.data = data;
			this.setViewData(data, clear);
		}
	}
	// Real loadFileInternal: clear=true when a file opens, false when it changed on disk.
	// The echo of our own save is dropped here. Not modelled: the three-way merge when `dirty`.
	loadFile(content: string, clear: boolean): void {
		const previous = this.lastSavedData;
		this.lastSavedData = content;
		if (previous !== null && previous === content) return;
		if (previous !== null && this.dirty && this.data === content) return;
		this.setData(content, clear);
	}
	onload(): void {}
	getState(): Record<string, unknown> {
		return { file: this.file?.path ?? null };
	}
	async setState(_state: unknown, _result: ViewStateResult): Promise<void> {}
	getViewData(): string {
		return this.data;
	}
	// Real save(): skips when nothing changed or nothing is loaded; save(true) is the unload path and calls clear().
	async save(clear?: boolean): Promise<void> {
		const data = this.getViewData();
		if (this.lastSavedData === data || this.lastSavedData === null) return;
		if (clear) {
			this.lastSavedData = null;
			this.clear();
		} else {
			this.data = data;
			this.lastSavedData = data;
		}
		this.dirty = false;
		this.savedData.push(data);
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

export interface Command {
	id: string;
	name: string;
	checkCallback?: (checking: boolean) => boolean | void;
}

export class Plugin {
	app = new App();
	commands: Command[] = [];
	addCommand(command: Command): Command {
		this.commands.push(command);
		return command;
	}
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
