import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanTextile } from '../src/syntax';
import { renderTextile } from '../src/render';

// Each styled piece as `text|classes`, plus `|hide` and `|widget` for live preview; in document order.
function styled(text: string): string[] {
	return [...scanTextile(text).ranges]
		.sort((a, b) => a.from - b.from || b.to - a.to)
		.map((r) => `${text.slice(r.from, r.to)}|${r.cls}${r.hide ? '|hide' : ''}${r.widget ? `|${r.widget}` : ''}`);
}

// Line classes as `line text|classes`.
function lineClasses(text: string): string[] {
	return scanTextile(text).lines
		.sort((a, b) => a.from - b.from)
		.map((l) => `${text.slice(l.from).split('\n')[0]}|${l.cls}`);
}

describe('scanTextile blocks', () => {
	it('styles every line of a heading block and hides its signature', () => {
		const text = 'h2. Title *b*\nnext line\n\npara';
		expect(lineClasses(text)).toEqual(['h2. Title *b*|HyperMD-header HyperMD-header-2', 'next line|HyperMD-header HyperMD-header-2']);
		expect(styled(text)).toEqual(['h2. |cm-formatting redmine-signature|hide', '*|cm-formatting|hide', 'b|cm-strong', '*|cm-formatting|hide']);
	});

	it('reads a signature with attributes', () => {
		expect(styled('h3(cls){color:red}. x')).toEqual(['h3(cls){color:red}. |cm-formatting redmine-signature|hide']);
	});

	it('styles blockquotes, and keeps a footnote signature visible', () => {
		expect(lineClasses('bq. quote')).toEqual(['bq. quote|HyperMD-quote redmine-quote']);
		expect(styled('fn1. note')).toEqual(['fn1. |cm-formatting redmine-signature']);
	});

	it('styles bc. lines as code up to a blank line, with no inline styling', () => {
		const text = 'bc. a *b*\nc\n\nd *e*';
		expect(lineClasses(text)).toEqual(['bc. a *b*|HyperMD-codeblock redmine-code-line', 'c|HyperMD-codeblock redmine-code-line']);
		expect(styled(text)).toEqual(['bc. |cm-formatting redmine-signature|hide', '*|cm-formatting|hide', 'e|cm-strong', '*|cm-formatting|hide']);
	});

	it('runs an extended bc.. block over blank lines up to the next signature', () => {
		const text = 'bc.. a\n\n*b*\n\np. *c*';
		expect(lineClasses(text)).toEqual(['bc.. a|HyperMD-codeblock redmine-code-line', '|HyperMD-codeblock redmine-code-line', '*b*|HyperMD-codeblock redmine-code-line']);
		expect(styled(text)).toContain('c|cm-strong');
		expect(styled(text)).not.toContain('b|cm-strong');
	});

	it('styles a <pre> block as code, its tags as markup, nothing inside as textile', () => {
		const text = '<pre><code class="sql">\nselect *x* -- #1\n</code></pre>\n\n*y*';
		expect(lineClasses(text)).toHaveLength(3);
		expect(styled(text)).toEqual([
			'<pre>|cm-formatting redmine-html', '<code class="sql">|cm-formatting redmine-html',
			'</code>|cm-formatting redmine-html', '</pre>|cm-formatting redmine-html',
			'*|cm-formatting|hide', 'y|cm-strong', '*|cm-formatting|hide',
		]);
	});

	it('reads an unclosed <pre> as a paragraph, like textile-js', () => {
		expect(lineClasses('<pre>\n*x*')).toEqual([]);
		expect(styled('<pre>\n*x*')).toContain('x|cm-strong');
	});

	it('replaces list markers with bullets and numbers, by depth', () => {
		const text = '* a\n** b\n# c\n# d\ncontinued *e*';
		expect(styled(text).filter((s) => s.includes('list-marker'))).toEqual([
			'* |cm-formatting redmine-list-marker|hide|•',
			'** |cm-formatting redmine-list-marker|hide|•',
			'# |cm-formatting redmine-list-marker|hide|1.',
			'# |cm-formatting redmine-list-marker|hide|2.',
		]);
		expect(lineClasses(text)).toEqual([
			'* a|redmine-list-line redmine-list-1', '** b|redmine-list-line redmine-list-2',
			'# c|redmine-list-line redmine-list-1', '# d|redmine-list-line redmine-list-1',
			'continued *e*|redmine-list-line redmine-list-1',
		]);
		expect(styled(text)).toContain('e|cm-strong');
	});

	it('restarts numbering in a new list and under a new parent item', () => {
		expect(styled('# a\n# b\n\n# c').filter((s) => s.includes('list-marker')).map((s) => s.split('|').pop())).toEqual(['1.', '2.', '1.']);
		expect(styled('# a\n## b\n## c\n# d\n## e').filter((s) => s.includes('list-marker')).map((s) => s.split('|').pop())).toEqual(['1.', '1.', '2.', '2.', '1.']);
	});

	it('does not read bold at a line start or an issue number as a list', () => {
		expect(lineClasses('*bold* text')).toEqual([]);
		expect(lineClasses('#273318 — x')).toEqual([]);
		expect(styled('#273318 — x')).toEqual(['#273318|redmine-issue-ref']);
	});

	it('ends a paragraph where a list starts', () => {
		expect(lineClasses('text\n* item')).toEqual(['* item|redmine-list-line redmine-list-1']);
	});

	it('styles table pipes and cell attributes as visible markup and cell text inline', () => {
		const text = '|_. a |b *c*|';
		expect(lineClasses(text)).toEqual(['|_. a |b *c*||redmine-table-line']);
		expect(styled(text)).toEqual(['||cm-formatting', '_. |cm-formatting', '||cm-formatting', '*|cm-formatting|hide', 'c|cm-strong', '*|cm-formatting|hide', '||cm-formatting']);
	});

	it('styles a horizontal rule and an HTML comment block', () => {
		expect(styled('---\n\nx')).toEqual(['---|cm-formatting']);
		expect(styled('<!-- a\nb -->')).toEqual(['<!-- a|cm-comment', 'b -->|cm-comment']);
	});

	it('ignores a leading BOM, so the first line can still be a heading', () => {
		const text = '\uFEFFh2. x';
		expect(lineClasses(text)).toEqual(['\uFEFFh2. x|HyperMD-header HyperMD-header-2']);
		expect(styled(text)).toEqual(['h2. |cm-formatting redmine-signature|hide']);
	});

	it('returns nothing for an empty or blank document', () => {
		expect(scanTextile('')).toEqual({ lines: [], ranges: [] });
		expect(scanTextile('\n  \n')).toEqual({ lines: [], ranges: [] });
	});
});

describe('scanTextile macros', () => {
	it('styles a collapse\'s first and last line as macro and its body as a document of its own', () => {
		const text = 'h2. a\n{{collapse(Show, Hide)\nh3. b\n}}\nafter';
		expect(styled(text)).toEqual([
			'h2. |cm-formatting redmine-signature|hide',
			'{{collapse(Show, Hide)|redmine-macro',
			'h3. |cm-formatting redmine-signature|hide',
			'}}|redmine-macro',
		]);
		expect(lineClasses(text)).toEqual(['h2. a|HyperMD-header HyperMD-header-2', 'h3. b|HyperMD-header HyperMD-header-3']);
	});

	it('styles an inline thumbnail and an escaped macro as macro text', () => {
		expect(styled('x {{thumbnail(a.png)}} !{{collapse}}')).toEqual(['{{thumbnail(a.png)}}|redmine-macro', '!{{collapse}}|redmine-macro']);
	});

	it('leaves unknown macros and an unclosed collapse to the textile rules', () => {
		expect(styled('{{toc}} *a*')).toEqual(['*|cm-formatting|hide', 'a|cm-strong', '*|cm-formatting|hide']);
		expect(styled('{{collapse\n*a*')).toContain('a|cm-strong');
	});
});

describe('scanTextile agrees with the reading view', () => {
	// Every bold, italic, code, link and deleted span the editor styles is one the preview renders, and vice versa.
	it('finds the same inline elements as textile-js in a sample draft', () => {
		const text = readFileSync('tests/fixtures/agreement.textile', 'utf8');
		const html = document.createElement('div');
		html.innerHTML = renderTextile(text);
		const kinds: Record<string, string> = { 'cm-strong': 'strong, b', 'cm-em': 'em, i', 'cm-inline-code': 'code', 'cm-link': 'a', 'cm-strikethrough': 'del' };
		for (const [cls, selector] of Object.entries(kinds)) {
			const scanned = scanTextile(text).ranges.filter((r) => r.cls === cls).sort((a, b) => a.from - b.from).map((r) => text.slice(r.from, r.to));
			// Code blocks are styled per line, not as inline code; the thumbnail error text is not in the draft.
			const rendered = Array.from(html.querySelectorAll(selector)).filter((el) => !el.closest('pre, .redmine-macro-error')).map((el) => el.textContent);
			expect({ cls, spans: scanned.map((s) => s.replace(/[*_@]/g, '')) }).toEqual({ cls, spans: rendered.map((s) => s!.replace(/[*_@]/g, '')) });
		}
	});

	it('scans a 5,000-line draft quickly enough to run on every keystroke', () => {
		const text = readFileSync('tests/fixtures/agreement.textile', 'utf8').repeat(125);
		const start = performance.now();
		scanTextile(text);
		expect(performance.now() - start).toBeLessThan(500);
	});
});
