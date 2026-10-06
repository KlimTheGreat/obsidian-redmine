import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';
import { TextileView } from '../src/textile-view';
import { VIEW_TYPE_TEXTILE } from '../src/constants';

function makeView(): TextileView {
	const view = new TextileView(new WorkspaceLeaf());
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

function editor(view: TextileView): HTMLTextAreaElement | null {
	return view.contentEl.querySelector('textarea');
}

// Opens a file the way Obsidian does (TextFileView.loadFileInternal → setData → setViewData).
function open(view: TextileView, text: string): void {
	view.loadFile(text, true);
}

// The file changed on disk while open (vault modify event → loadFileInternal with clear=false).
function changeOnDisk(view: TextileView, text: string): void {
	view.loadFile(text, false);
}

function type(el: HTMLTextAreaElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input'));
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

describe('TextileView source mode', () => {
	it('opens in preview with an "Edit source" button', () => {
		const view = makeView();
		view.setViewData('h2. x', true);
		expect(view.mode).toBe('preview');
		expect(modeButton(view).getAttribute('aria-label')).toBe('Edit source');
		expect(modeButton(view).dataset.icon).toBe('pencil');
		expect(editor(view)).toBeNull();
	});

	it('the header button switches to source and back', () => {
		const view = makeView();
		view.setViewData('h2. x', true);
		click(modeButton(view));
		expect(view.mode).toBe('source');
		expect(editor(view)?.value).toBe('h2. x');
		expect(preview(view)).toBeNull();
		expect(modeButton(view).getAttribute('aria-label')).toBe('Show preview');
		expect(modeButton(view).dataset.icon).toBe('book-open');
		click(modeButton(view));
		expect(view.mode).toBe('preview');
		expect(editor(view)).toBeNull();
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('x');
	});

	it('shows HTML from the file as text in the source, never as markup', () => {
		const view = makeView();
		view.setViewData('<img src="x" onerror="alert(1)">', true);
		view.setMode('source');
		expect(view.contentEl.querySelector('img')).toBeNull();
		expect(editor(view)?.value).toBe('<img src="x" onerror="alert(1)">');
	});

	it('typing updates the data verbatim and requests a save', async () => {
		const view = makeView();
		open(view, 'h2. x');
		view.setMode('source');
		type(editor(view)!, 'h2. Новый\n\nтекст  \n');
		expect(view.getViewData()).toBe('h2. Новый\n\nтекст  \n');
		expect(view.saveRequests).toBe(1);
		await view.save();
		expect(view.savedData).toEqual(['h2. Новый\n\nтекст  \n']);
	});

	it('keeps CRLF line breaks after an edit', () => {
		const view = makeView();
		view.setViewData('a\r\nb', true);
		view.setMode('source');
		type(editor(view)!, 'a\nb\nc');
		expect(view.getViewData()).toBe('a\r\nb\r\nc');
	});

	it('does not touch the data when the source is only viewed', () => {
		const view = makeView();
		view.setViewData('\uFEFFa\r\nb  ', true);
		view.setMode('source');
		view.setMode('preview');
		expect(view.getViewData()).toBe('\uFEFFa\r\nb  ');
		expect(view.saveRequests).toBe(0);
	});

	it('preview shows the edited text after switching back', () => {
		const view = makeView();
		view.setViewData('h2. old', true);
		view.setMode('source');
		type(editor(view)!, 'h2. new');
		view.setMode('preview');
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('new');
	});

	it('keeps the textarea and caret when our own save comes back from disk', async () => {
		const view = makeView();
		open(view, 'abcdef');
		view.setMode('source');
		const el = editor(view)!;
		type(el, 'abcdefg');
		el.setSelectionRange(3, 3);
		await view.save();
		changeOnDisk(view, 'abcdefg');
		expect(editor(view)).toBe(el);
		expect(el.selectionStart).toBe(3);
	});

	it('shows a change made on disk while editing and keeps the caret', () => {
		const view = makeView();
		open(view, 'abcdef');
		view.setMode('source');
		const el = editor(view)!;
		el.setSelectionRange(2, 4);
		changeOnDisk(view, 'abcdefgh');
		expect(editor(view)).toBe(el);
		expect(el.value).toBe('abcdefgh');
		expect([el.selectionStart, el.selectionEnd]).toEqual([2, 4]);
		changeOnDisk(view, 'ab');
		expect(el.value).toBe('ab');
		expect([el.selectionStart, el.selectionEnd]).toEqual([2, 2]);
		expect(view.getViewData()).toBe('ab');
	});

	it('typing after a change on disk builds on the new text, not the old one', async () => {
		const view = makeView();
		open(view, 'old text');
		view.setMode('source');
		changeOnDisk(view, 'text from Claude');
		const el = editor(view)!;
		type(el, el.value + '!');
		await view.save();
		expect(view.savedData).toEqual(['text from Claude!']);
	});

	it('shows a change made on disk in the preview', () => {
		const view = makeView();
		open(view, 'h2. old');
		changeOnDisk(view, 'h2. new');
		expect(preview(view)?.querySelector('h2')?.textContent).toBe('new');
	});

	it('stays in source mode with a fresh textarea when another file opens in the tab', () => {
		const view = makeView();
		view.setViewData('first', true);
		view.setMode('source');
		const first = editor(view);
		view.setViewData('second', true);
		expect(view.mode).toBe('source');
		expect(editor(view)).not.toBe(first);
		expect(editor(view)?.value).toBe('second');
	});

	it('does not save between clear() and the next file', async () => {
		const view = makeView();
		open(view, 'draft');
		view.setMode('source');
		type(editor(view)!, 'draft edited');
		await view.save(true); // tab switches to another file: Obsidian saves, then clears
		await view.save(); // a requestSave() that fired late
		expect(view.savedData).toEqual(['draft edited']);
		open(view, 'next');
		type(editor(view)!, 'next edited');
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

describe('TextileView mode memory', () => {
	it('stores the mode in the view state next to the base state', () => {
		const view = makeView();
		expect(view.getState()).toEqual({ file: null, mode: 'preview' });
		view.setMode('source');
		expect(view.getState()).toEqual({ file: null, mode: 'source' });
	});

	it('restores source mode from the view state', async () => {
		const view = makeView();
		view.setViewData('h2. x', true);
		await view.setState({ file: 'a.textile', mode: 'source' }, { history: false });
		expect(view.mode).toBe('source');
		expect(editor(view)?.value).toBe('h2. x');
		expect(modeButton(view).getAttribute('aria-label')).toBe('Show preview');
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
});
