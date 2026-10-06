import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';
import { TextileView } from '../src/textile-view';
import { VIEW_TYPE_TEXTILE } from '../src/constants';

function makeView(): TextileView {
	return new TextileView(new WorkspaceLeaf());
}

function preview(view: TextileView): HTMLElement | null {
	return view.contentEl.querySelector('.redmine-textile-preview');
}

function click(el: Element): MouseEvent {
	const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
	el.dispatchEvent(evt);
	return evt;
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
		expect(view.contentEl.querySelector('img')?.hasAttribute('onerror')).toBe(false);
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
