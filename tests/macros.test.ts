import { describe, expect, it } from 'vitest';
import { collapseHtml, escapeHtml, parseMacroArgs, thumbnailHtml } from '../src/macros';

describe('parseMacroArgs', () => {
	it('splits by commas and trims the spaces around them, like Redmine', () => {
		expect(parseMacroArgs('SQL: проверка перед выкаткой, 18 строк')).toEqual(['SQL: проверка перед выкаткой', '18 строк']);
	});

	it('keeps commas inside double quotes and strips the quotes', () => {
		expect(parseMacroArgs('"SQL: проверка, 18 строк", Скрыть')).toEqual(['SQL: проверка, 18 строк', 'Скрыть']);
	});

	it('turns doubled quotes into one', () => {
		expect(parseMacroArgs('"say ""hi"""')).toEqual(['say "hi"']);
	});

	it('returns no arguments for an empty string and drops trailing empty ones', () => {
		expect(parseMacroArgs('')).toEqual([]);
		expect(parseMacroArgs('a,')).toEqual(['a']);
	});
});

describe('collapseHtml', () => {
	it('shows the first label while closed and the second while open', () => {
		const html = collapseHtml(['Показать SQL', 'Скрыть SQL'], '<p>x</p>');
		expect(html).toContain('<span class="redmine-collapse-show">Показать SQL</span>');
		expect(html).toContain('<span class="redmine-collapse-hide">Скрыть SQL</span>');
		expect(html).toContain('<div class="redmine-collapse-body">\n<p>x</p>\n</div>');
		expect(html.startsWith('<details class="redmine-collapse">')).toBe(true);
	});

	it('uses one label for both states when only one is given', () => {
		const html = collapseHtml(['Детали'], '');
		expect(html).toContain('<span class="redmine-collapse-show">Детали</span>');
		expect(html).toContain('<span class="redmine-collapse-hide">Детали</span>');
	});

	it("falls back to Redmine's Show / Hide labels", () => {
		const html = collapseHtml([], '');
		expect(html).toContain('<span class="redmine-collapse-show">Show</span>');
		expect(html).toContain('<span class="redmine-collapse-hide">Hide</span>');
	});

	it('escapes HTML in labels', () => {
		expect(collapseHtml(['<b>x</b>'], '')).toContain('&lt;b&gt;x&lt;/b&gt;');
	});
});

describe('thumbnailHtml', () => {
	it('makes an image of the attachment fitted into 200px by default', () => {
		expect(thumbnailHtml(['скрин.png'])).toBe(
			'<img class="redmine-thumbnail" src="скрин.png" alt="скрин.png" style="max-width: 200px; max-height: 200px">',
		);
	});

	it('takes size and title options in any order and case', () => {
		const html = thumbnailHtml(['a.png', 'Title=Схема', 'size=300']);
		expect(html).toContain('style="max-width: 300px; max-height: 300px"');
		expect(html).toContain('title="Схема"');
	});

	it('treats size=0 as the default size', () => {
		expect(thumbnailHtml(['a.png', 'size=0'])).toContain('max-width: 200px');
	});

	it("shows Redmine's error for a missing file name or a bad size", () => {
		expect(thumbnailHtml([])).toBe('<p class="redmine-macro-error">Error executing the <strong>thumbnail</strong> macro (Filename required)</p>');
		expect(thumbnailHtml(['a.png', 'size=big'])).toContain('(Invalid size parameter)');
	});

	it('escapes quotes and tags in the file name and title', () => {
		const html = thumbnailHtml(['a"b.png', 'title=<i>']);
		expect(html).toContain('src="a&quot;b.png"');
		expect(html).toContain('title="&lt;i&gt;"');
	});
});

describe('escapeHtml', () => {
	it('escapes the characters that matter in text and attributes', () => {
		expect(escapeHtml('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
	});
});
