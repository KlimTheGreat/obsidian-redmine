import { afterEach, describe, expect, it, vi } from 'vitest';
import { prism, TFile, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { TextileMode, TextileView } from '../src/textile-view';
import { VIEW_TYPE_TEXTILE } from '../src/constants';

// Starts in reading mode unless told otherwise, as a tab restored with that mode would.
function makeView(mode: TextileMode = 'preview'): TextileView {
	const view = new TextileView(new WorkspaceLeaf());
	view.mode = mode;
	if (mode !== 'preview') view.editMode = mode;
	view.onload();
	return view;
}

function preview(view: TextileView): HTMLElement | null {
	return view.contentEl.querySelector('.redmine-textile-preview');
}

function click(el: Element): MouseEvent {
	const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
	el.dispatchEvent(evt);
	return evt;
}

function modeButton(view: TextileView): HTMLElement {
	return view.actionsEl.querySelector('button')!;
}

function editor(view: TextileView): EditorView | null {
	const el = view.contentEl.querySelector<HTMLElement>('.cm-editor');
	return el ? EditorView.findFromDOM(el) : null;
}

// What the editor shows, line by line (hidden markup is not in the DOM).
function lines(view: TextileView): string[] {
	return Array.from(view.contentEl.querySelectorAll('.cm-line'), (line) => line.textContent ?? '');
}

// Opens a file the way Obsidian does (TextFileView.loadFileInternal → setData → setViewData).
function open(view: TextileView, text: string): void {
	view.loadFile(text, true);
}

// The file changed on disk while open (vault modify event → loadFileInternal with clear=false).
function changeOnDisk(view: TextileView, text: string): void {
	view.loadFile(text, false);
}

// The user typing: replaces from..to with `insert`, tagged as input like CodeMirror's own typing.
function type(cm: EditorView, from: number, to: number, insert: string): void {
	cm.dispatch({ changes: { from, to, insert }, userEvent: 'input.type' });
}

describe('TextileView', () => {
	it('reports its view type', () => {
		expect(makeView().getViewType()).toBe(VIEW_TYPE_TEXTILE);
	});

	it('shows the file name without extension as the tab title', () => {
		const view = makeView();
		view.file = new TFile('Oggetto/Prosv/273317/comments/273317-plan.textile');
		expect(view.getDisplayText()).toBe('273317-plan');
	});

	it('falls back to a generic title when no file is open', () => {
		expect(makeView().getDisplayText()).toBe('Textile');
	});

	it('returns the data exactly as received, byte for byte', () => {
		const view = makeView();
		const source = '\uFEFFh2. Итог\r\n\r\n|_. a |_. b |\r\n|\\2=. total |  \n';
		view.setViewData(source, true);
		expect(view.getViewData()).toBe(source);
	});

	it('renders textile as HTML in the preview', () => {
		const view = makeView();
		view.setViewData('h2. План\n\n* пункт', true);
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('План');
		expect(preview(view)?.querySelector('li')?.textContent).toBe('пункт');
	});

	it('styles the preview like a rendered note', () => {
		const view = makeView();
		view.setViewData('text', true);
		expect(preview(view)?.classList.contains('markdown-rendered')).toBe(true);
	});

	it('renders a file that starts with a BOM and keeps the BOM in the data', () => {
		const view = makeView();
		view.setViewData('\uFEFFh2. Итог', true);
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('Итог');
		expect(view.getViewData()).toBe('\uFEFFh2. Итог');
	});

	it('strips scripts, event handlers and javascript: links from the preview', () => {
		const view = makeView();
		view.setViewData('<script>window.pwned = 1</script>\n\n<img src="x" onerror="alert(1)">\n\n"bad":javascript:alert(1)', true);
		expect(view.contentEl.querySelector('script')).toBeNull();
		expect(view.contentEl.querySelector('[onerror]')).toBeNull();
		expect(view.contentEl.querySelector('a')?.hasAttribute('href')).toBe(false);
	});

	it('replaces the previous file content instead of appending', () => {
		const view = makeView();
		view.setViewData('h2. first', true);
		view.setViewData('h2. second', true);
		expect(view.contentEl.querySelectorAll('.redmine-textile-preview')).toHaveLength(1);
		expect(view.contentEl.textContent).toBe('second');
	});

	it('renders an empty file without errors', () => {
		const view = makeView();
		view.setViewData('', true);
		expect(view.getViewData()).toBe('');
		expect(preview(view)?.textContent).toBe('');
	});

	it('clear() drops the data and the rendered content', () => {
		const view = makeView();
		view.setViewData('something', true);
		view.clear();
		expect(view.getViewData()).toBe('');
		expect(view.contentEl.textContent).toBe('');
	});
});

describe('TextileView preview links', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('opens web links in the browser instead of navigating Obsidian', () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const view = makeView();
		view.setViewData('"Redmine":https://www.redmine.org', true);
		const evt = click(view.contentEl.querySelector('a')!);
		expect(evt.defaultPrevented).toBe(true);
		expect(open).toHaveBeenCalledWith('https://www.redmine.org', '_blank');
	});

	it('does nothing for links that are not web or mail links', () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const view = makeView();
		view.setViewData('"скрин":screen.png', true);
		const evt = click(view.contentEl.querySelector('a')!);
		expect(evt.defaultPrevented).toBe(true);
		expect(open).not.toHaveBeenCalled();
	});
});

describe('TextileView editing', () => {
	it('opens a new tab in live preview with a "Read" button', () => {
		const view = new TextileView(new WorkspaceLeaf());
		view.onload();
		view.setViewData('h2. x', true);
		expect(view.mode).toBe('live');
		expect(editor(view)).not.toBeNull();
		expect(preview(view)).toBeNull();
		expect(modeButton(view).getAttribute('aria-label')).toBe('Read');
		expect(modeButton(view).dataset.icon).toBe('book-open');
	});

	it('the header button switches to reading and back to the editing mode used last', () => {
		const view = makeView('source');
		view.setViewData('h2. x', true);
		click(modeButton(view));
		expect(view.mode).toBe('preview');
		expect(editor(view)).toBeNull();
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('x');
		expect(modeButton(view).getAttribute('aria-label')).toBe('Edit');
		expect(modeButton(view).dataset.icon).toBe('pencil');
		click(modeButton(view));
		expect(view.mode).toBe('source');
		expect(editor(view)?.state.doc.toString()).toBe('h2. x');
	});

	it('shows HTML from the file as text in the editor, never as markup', () => {
		const view = makeView('source');
		view.setViewData('<img src="x" onerror="alert(1)">', true);
		expect(view.contentEl.querySelector('img')).toBeNull();
		expect(lines(view)).toEqual(['<img src="x" onerror="alert(1)">']);
	});

	it('typing updates the data verbatim and requests a save', async () => {
		const view = makeView('source');
		open(view, 'h2. x');
		type(editor(view)!, 0, 5, 'h2. Новый\n\nтекст  \n');
		expect(view.getViewData()).toBe('h2. Новый\n\nтекст  \n');
		expect(view.saveRequests).toBe(1);
		await view.save();
		expect(view.savedData).toEqual(['h2. Новый\n\nтекст  \n']);
	});

	it('keeps CRLF line breaks when typing a new line', () => {
		const view = makeView('source');
		view.setViewData('a\r\nb', true);
		const cm = editor(view)!;
		type(cm, 3, 3, cm.state.lineBreak + 'c');
		expect(view.getViewData()).toBe('a\r\nb\r\nc');
	});

	it('pasted text takes the line breaks of the file', () => {
		const view = makeView('source');
		view.setViewData('a\r\nb', true);
		editor(view)!.dispatch({ changes: { from: 3, insert: '\nc\r\nd\re' }, userEvent: 'input.paste' });
		expect(view.getViewData()).toBe('a\r\nb\r\nc\r\nd\r\ne');
		const lf = makeView('source');
		lf.setViewData('a', true);
		editor(lf)!.dispatch({ changes: { from: 1, insert: '\r\nb' }, userEvent: 'input.paste' });
		expect(lf.getViewData()).toBe('a\nb');
	});

	it('keeps a stray line break of the other kind byte for byte', () => {
		const view = makeView('source');
		open(view, 'a\r\nb\nc\rd');
		type(editor(view)!, 0, 0, '!');
		expect(view.getViewData()).toBe('!a\r\nb\nc\rd');
	});

	it('does not touch the data when the editor is only viewed', () => {
		const view = makeView('live');
		view.setViewData('\uFEFFh2. a\r\nb  ', true);
		view.setMode('source');
		view.setMode('preview');
		expect(view.getViewData()).toBe('\uFEFFh2. a\r\nb  ');
		expect(view.saveRequests).toBe(0);
	});

	it('preview shows the edited text after switching back', () => {
		const view = makeView('source');
		view.setViewData('h2. old', true);
		type(editor(view)!, 4, 7, 'new');
		view.setMode('preview');
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('new');
	});

	it('keeps the editor and caret when our own save comes back from disk', async () => {
		const view = makeView('source');
		open(view, 'abcdef');
		const cm = editor(view)!;
		type(cm, 6, 6, 'g');
		cm.dispatch({ selection: { anchor: 3 } });
		await view.save();
		changeOnDisk(view, 'abcdefg');
		expect(editor(view)).toBe(cm);
		expect(cm.state.selection.main.head).toBe(3);
	});

	it('shows a change made on disk while editing and keeps the caret', () => {
		const view = makeView('source');
		open(view, 'abcdef');
		const cm = editor(view)!;
		cm.dispatch({ selection: { anchor: 2, head: 4 } });
		changeOnDisk(view, 'abcdefgh');
		expect(editor(view)).toBe(cm);
		expect(cm.state.doc.toString()).toBe('abcdefgh');
		expect([cm.state.selection.main.anchor, cm.state.selection.main.head]).toEqual([2, 4]);
		changeOnDisk(view, 'ab');
		expect(cm.state.doc.toString()).toBe('ab');
		expect(cm.state.selection.main.head).toBe(2);
		expect(view.getViewData()).toBe('ab');
		expect(view.saveRequests).toBe(0);
	});

	it('undo reverts the user\'s own edits but not a change made on disk', () => {
		const view = makeView('source');
		open(view, 'one\ntwo');
		const cm = editor(view)!;
		type(cm, 0, 0, 'my ');
		changeOnDisk(view, 'my one\ntwo\nthree');
		undo(cm);
		expect(view.getViewData()).toBe('one\ntwo\nthree');
	});

	it('typing after a change on disk builds on the new text, not the old one', async () => {
		const view = makeView('source');
		open(view, 'old text');
		changeOnDisk(view, 'text from Claude');
		const cm = editor(view)!;
		type(cm, cm.state.doc.length, cm.state.doc.length, '!');
		await view.save();
		expect(view.savedData).toEqual(['text from Claude!']);
	});

	it('takes a change on disk that switches the file between LF and CRLF', () => {
		const view = makeView('source');
		open(view, 'a\nb');
		changeOnDisk(view, 'a\r\nb\r\nc');
		const cm = editor(view)!;
		type(cm, cm.state.doc.length, cm.state.doc.length, cm.state.lineBreak + 'd');
		expect(view.getViewData()).toBe('a\r\nb\r\nc\r\nd');
	});

	it('shows a change made on disk in the preview', () => {
		const view = makeView();
		open(view, 'h2. old');
		changeOnDisk(view, 'h2. new');
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('new');
	});

	it('stays in its editing mode with a fresh editor when another file opens in the tab', () => {
		const view = makeView('source');
		view.setViewData('first', true);
		const first = editor(view);
		view.setViewData('second', true);
		expect(view.mode).toBe('source');
		expect(editor(view)).not.toBe(first);
		expect(view.contentEl.querySelectorAll('.cm-editor')).toHaveLength(1);
		expect(editor(view)?.state.doc.toString()).toBe('second');
	});

	it('does not save between clear() and the next file', async () => {
		const view = makeView('source');
		open(view, 'draft');
		type(editor(view)!, 5, 5, ' edited');
		await view.save(true); // tab switches to another file: Obsidian saves, then clears
		await view.save(); // a requestSave() that fired late
		expect(view.savedData).toEqual(['draft edited']);
		open(view, 'next');
		type(editor(view)!, 4, 4, ' edited');
		await view.save();
		expect(view.savedData).toEqual(['draft edited', 'next edited']);
	});

	it('asks Obsidian to store the layout when the mode changes', () => {
		const view = makeView();
		view.setMode('source');
		view.setMode('source');
		expect(view.app.workspace.layoutSaves).toBe(1);
	});
});

describe('TextileView live preview and source', () => {
	it('switching between live preview and source keeps the editor, caret and undo history', () => {
		const view = makeView('live');
		open(view, 'some *bold* text');
		const cm = editor(view)!;
		type(cm, 0, 0, 'x');
		cm.dispatch({ selection: { anchor: 3 } });
		view.toggleLivePreview();
		expect(view.mode).toBe('source');
		expect(editor(view)).toBe(cm);
		expect(cm.state.selection.main.head).toBe(3);
		expect(view.contentEl.querySelector('.is-live-preview')).toBeNull();
		undo(cm);
		expect(view.getViewData()).toBe('some *bold* text');
		view.toggleLivePreview();
		expect(view.mode).toBe('live');
		expect(view.contentEl.querySelector('.is-live-preview')).not.toBeNull();
	});

	it('toggling live preview does nothing in reading mode', () => {
		const view = makeView();
		view.toggleLivePreview();
		expect(view.mode).toBe('preview');
	});

	it('styles the editor like Obsidian\'s markdown editor', () => {
		const view = makeView('live');
		view.setViewData('x', true);
		const host = view.contentEl.querySelector('.redmine-textile-editor');
		expect(host?.classList).toContain('markdown-source-view');
		expect(host?.classList).toContain('mod-cm6');
		expect(host?.classList).toContain('is-live-preview');
	});
});

describe('TextileView mode memory', () => {
	it('stores the mode in the view state next to the base state', () => {
		const view = makeView();
		expect(view.getState()).toEqual({ file: null, mode: 'preview' });
		view.setMode('source');
		expect(view.getState()).toEqual({ file: null, mode: 'source' });
	});

	it('restores each mode from the view state', async () => {
		const view = makeView();
		view.setViewData('h2. x', true);
		await view.setState({ file: 'a.textile', mode: 'source' }, { history: false });
		expect(view.mode).toBe('source');
		expect(editor(view)?.state.doc.toString()).toBe('h2. x');
		expect(modeButton(view).getAttribute('aria-label')).toBe('Read');
		await view.setState({ file: 'a.textile', mode: 'preview' }, { history: false });
		expect(view.mode).toBe('preview');
		await view.setState({ file: 'a.textile', mode: 'live' }, { history: false });
		expect(view.mode).toBe('live');
	});

	it('ignores a missing or unknown mode in the view state', async () => {
		const view = makeView();
		await view.setState({ file: 'a.textile', mode: 'wysiwyg' }, { history: false });
		expect(view.mode).toBe('preview');
		await view.setState(null, { history: false });
		expect(view.mode).toBe('preview');
	});
});

describe('TextileView Redmine markup', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('shows an image from the vault next to the draft', () => {
		const view = makeView();
		view.file = new TFile('Oggetto/Prosv/273318/comments/273318-итоги.textile');
		view.app.vault.files.push(new TFile('Oggetto/Prosv/273318/скрин.png'));
		open(view, '!скрин.png!');
		expect(preview(view)?.querySelector('img')?.getAttribute('src')).toBe('app://vault/Oggetto/Prosv/273318/скрин.png');
	});

	it('shows a placeholder when the name points to a file that is not an image', () => {
		const view = makeView();
		view.app.vault.files.push(new TFile('notes/скрин.png.md'), new TFile('notes/план.textile'));
		open(view, '!план.textile!');
		expect(preview(view)?.querySelector('img')).toBeNull();
		expect(preview(view)?.querySelector('.redmine-attachment')?.textContent).toBe('план.textile');
	});

	it('highlights code blocks with Prism', async () => {
		prism.highlighted.length = 0;
		const view = makeView();
		open(view, '<pre><code class="sql">\nSELECT 1;\n</code></pre>');
		await vi.waitFor(() => expect(prism.highlighted).toHaveLength(1));
		expect(prism.highlighted[0]).toBe(preview(view)?.querySelector('code.language-sql'));
	});

	it('keeps open collapses open when the file changes on disk', () => {
		const view = makeView();
		open(view, '{{collapse(A)\na\n}}\n\n{{collapse(B)\nb\n}}');
		preview(view)!.querySelectorAll('details')[1]!.open = true;
		changeOnDisk(view, '{{collapse(A)\na\n}}\n\n{{collapse(B)\nb, edited\n}}');
		const details = preview(view)!.querySelectorAll('details');
		expect([details[0]!.open, details[1]!.open]).toEqual([false, true]);
		expect(details[1]!.textContent).toContain('b, edited');
	});

	it('opens collapses closed after switching back from editing', () => {
		const view = makeView();
		open(view, '{{collapse(A)\na\n}}');
		preview(view)!.querySelector('details')!.open = true;
		view.setMode('source');
		view.setMode('preview');
		expect(preview(view)!.querySelector('details')!.open).toBe(false);
	});

	it('shows a message instead of failing when the parser throws, and keeps the data', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const view = makeView();
		// textile-js throws on a NUL character (TypeError inside the parser).
		const text = 'a' + String.fromCharCode(0) + 'b';
		open(view, text);
		expect(preview(view)?.querySelector('.redmine-render-error')?.textContent).toContain('could not be rendered');
		expect(error).toHaveBeenCalled();
		expect(view.getViewData()).toBe(text);
		view.setMode('source');
		expect(editor(view)?.state.sliceDoc()).toBe(text);
	});

	it('clicking a collapse title does not count as a link click', () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const view = makeView();
		view.setViewData('{{collapse(A)\na\n}}', true);
		const evt = click(preview(view)!.querySelector('summary')!);
		expect(evt.defaultPrevented).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});
});
