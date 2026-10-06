import { describe, expect, it } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';
import { TextileView } from '../src/textile-view';
import { VIEW_TYPE_TEXTILE } from '../src/constants';

function makeView(): TextileView {
	return new TextileView(new WorkspaceLeaf());
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

	it('renders the raw source as text', () => {
		const view = makeView();
		view.setViewData('h2. План\n\n* пункт', true);
		const pre = view.contentEl.querySelector('pre');
		expect(pre?.textContent).toBe('h2. План\n\n* пункт');
	});

	it('returns the data exactly as received, byte for byte', () => {
		const view = makeView();
		const source = '﻿h2. Итог\r\n\r\n|_. a |_. b |\r\n|\\2=. total |  \n';
		view.setViewData(source, true);
		expect(view.getViewData()).toBe(source);
	});

	it('shows HTML inside the source as text, never as markup', () => {
		const view = makeView();
		view.setViewData('<pre>code</pre><img src=x onerror="alert(1)">', true);
		expect(view.contentEl.querySelector('img')).toBeNull();
		expect(view.contentEl.querySelectorAll('pre')).toHaveLength(1);
		expect(view.contentEl.textContent).toBe('<pre>code</pre><img src=x onerror="alert(1)">');
	});

	it('replaces the previous file content instead of appending', () => {
		const view = makeView();
		view.setViewData('first', true);
		view.setViewData('second', true);
		expect(view.contentEl.querySelectorAll('pre')).toHaveLength(1);
		expect(view.contentEl.textContent).toBe('second');
	});

	it('renders an empty file without errors', () => {
		const view = makeView();
		view.setViewData('', true);
		expect(view.getViewData()).toBe('');
		expect(view.contentEl.querySelector('pre')?.textContent).toBe('');
	});

	it('clear() drops the data and the rendered content', () => {
		const view = makeView();
		view.setViewData('something', true);
		view.clear();
		expect(view.getViewData()).toBe('');
		expect(view.contentEl.textContent).toBe('');
	});
});
