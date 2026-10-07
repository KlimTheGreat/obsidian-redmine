import { describe, expect, it } from 'vitest';
import { scanInline, SyntaxRange } from '../src/syntax-inline';

// Each styled piece as `text|classes`, plus `|hide` for markup live preview hides; in document order.
function inline(text: string): string[] {
	const out: SyntaxRange[] = [];
	scanInline(text, 0, out);
	return out
		.sort((a, b) => a.from - b.from || b.to - a.to)
		.map((r) => `${text.slice(r.from, r.to)}|${r.cls}${r.hide ? '|hide' : ''}`);
}

describe('scanInline phrases', () => {
	it('styles bold, italic and inline code, with their markers as hidden markup', () => {
		expect(inline('a *b* _c_ @d@')).toEqual([
			'*|cm-formatting|hide', 'b|cm-strong', '*|cm-formatting|hide',
			'_|cm-formatting|hide', 'c|cm-em', '_|cm-formatting|hide',
			'@|cm-formatting|hide', 'd|cm-inline-code', '@|cm-formatting|hide',
		]);
	});

	it('styles the other phrase types', () => {
		expect(inline('**b** __i__ -del- +ins+ ^sup^ ~sub~ ??cite??').filter((s) => !s.includes('cm-formatting'))).toEqual([
			'b|cm-strong', 'i|cm-em', 'del|cm-strikethrough', 'ins|redmine-ins', 'sup|redmine-sup', 'sub|redmine-sub', 'cite|redmine-cite',
		]);
	});

	it('hides a %{style} span\'s attributes together with its opening marker', () => {
		expect(inline('%{color:red}red%')).toEqual(['%{color:red}|cm-formatting|hide', 'red|redmine-span', '%|cm-formatting|hide']);
	});

	it('styles phrases inside phrases, but nothing inside inline code', () => {
		expect(inline('*a _b_*')).toEqual(['*|cm-formatting|hide', 'a _b_|cm-strong', '_|cm-formatting|hide', 'b|cm-em', '_|cm-formatting|hide', '*|cm-formatting|hide']);
		expect(inline('@*x* #12@')).toEqual(['@|cm-formatting|hide', '*x* #12|cm-inline-code', '@|cm-formatting|hide']);
	});

	it('opens a phrase only at a boundary and closes it only before one, like textile-js', () => {
		expect(inline('a*b*c')).toEqual([]);
		expect(inline('2*3*4 and snake_case_name')).toEqual([]);
		expect(inline('(*b*), "*c*"')).toContain('b|cm-strong');
		expect(inline('[*b*]x')).toContain('b|cm-strong');
	});

	it('leaves half-typed markup unstyled', () => {
		expect(inline('*bold')).toEqual([]);
		expect(inline('* not bold *')).toEqual([]);
		expect(inline('@')).toEqual([]);
	});

	it('hides ==notextile== markers and styles nothing between them', () => {
		expect(inline('==*a*==')).toEqual(['==|cm-formatting|hide', '==|cm-formatting|hide']);
	});
});

describe('scanInline links, images and HTML', () => {
	it('shows only a link\'s text; the quotes and the url are hidden markup', () => {
		expect(inline('see "Redmine":https://redmine.org.')).toEqual([
			'"|cm-formatting|hide', 'Redmine|cm-link', '":https://redmine.org|cm-formatting cm-url|hide',
		]);
	});

	it('hides a link title with the url', () => {
		expect(inline('"text(title)":http://x.ru')).toEqual(['"|cm-formatting|hide', 'text|cm-link', '(title)":http://x.ru|cm-formatting cm-url|hide']);
	});

	it('styles phrases inside link text', () => {
		expect(inline('"*b*":http://x.ru')).toContain('b|cm-strong');
	});

	it('leaves a link without a url unstyled', () => {
		expect(inline('"text": nothing')).toEqual([]);
	});

	it('styles an image as visible markup', () => {
		expect(inline('!screen.png! and !(left)a.png(alt)!:http://x.ru')).toEqual([
			'!screen.png!|cm-formatting redmine-image', '!(left)a.png(alt)!:http://x.ru|cm-formatting redmine-image',
		]);
	});

	it('styles HTML tags as markup and their content like the matching phrase; <code> content stays raw', () => {
		expect(inline('<b>x</b> <code>*y*</code> <br>')).toEqual([
			'<b>|cm-formatting redmine-html', 'x|cm-strong', '</b>|cm-formatting redmine-html',
			'<code>|cm-formatting redmine-html', '*y*|cm-inline-code', '</code>|cm-formatting redmine-html',
			'<br>|cm-formatting redmine-html',
		]);
	});

	it('leaves a tag without its closing tag on the line unstyled', () => {
		expect(inline('<b>x')).toEqual([]);
	});

	it('styles an HTML comment', () => {
		expect(inline('a <!-- note --> b')).toEqual(['<!-- note -->|cm-comment']);
	});
});

describe('scanInline issue references', () => {
	it('marks #123 like the preview does', () => {
		expect(inline('see #123, ##45 and #6-2.')).toEqual(['#123|redmine-issue-ref', '##45|redmine-issue-ref', '#6-2|redmine-issue-ref']);
	});

	it('marks a reference inside bold but not inside code or links', () => {
		expect(inline('*#1* @#2@ "#3":http://x.ru <code>#4</code>')).toContain('#1|redmine-issue-ref');
		expect(inline('*#1* @#2@ "#3":http://x.ru <code>#4</code>').filter((s) => s.includes('issue'))).toEqual(['#1|redmine-issue-ref']);
	});

	it('does not mark an escaped !#123 or a #hash inside a word', () => {
		expect(inline('!#123 a#1')).toEqual([]);
	});
});

describe('scanInline positions', () => {
	it('adds the offset of the line to every position', () => {
		const out: SyntaxRange[] = [];
		scanInline('*b*', 10, out);
		expect(out.map((r) => [r.from, r.to])).toEqual([[10, 11], [11, 12], [12, 13]]);
	});
});
