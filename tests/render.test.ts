import { describe, expect, it } from 'vitest';
import { renderTextile } from '../src/render';

describe('renderTextile', () => {
	it('renders headings, lists and inline code', () => {
		const html = renderTextile('h2. План\n\n* пункт @code@');
		expect(html).toContain('<h2>План</h2>');
		expect(html).toContain('<li>пункт <code>code</code></li>');
	});

	it('turns a single newline inside a paragraph into a line break, like Redmine', () => {
		expect(renderTextile('первая\nвторая')).toBe('<p>первая<br />\nвторая</p>');
	});

	it('renders a file that starts with a BOM', () => {
		expect(renderTextile('\uFEFFh2. Итог')).toBe('<h2>Итог</h2>');
	});

	it('renders Windows line breaks the same as Unix ones', () => {
		expect(renderTextile('h2. a\r\n\r\nb\r\nc')).toBe(renderTextile('h2. a\n\nb\nc'));
	});

	it('renders table cells with colspan', () => {
		const html = renderTextile('|\\2=. итого |\n|a|b|');
		expect(html).toContain('colspan="2"');
		expect(html).toContain('<td>a</td>');
	});

	it('renders an empty file as an empty string', () => {
		expect(renderTextile('')).toBe('');
	});

});

const SQL_COLLAPSE = [
	'Текст',
	'',
	'{{collapse(SQL: дубли ключей)',
	'<pre><code class="sql">',
	'SELECT a',
	'',
	'FROM t WHERE a < b;',
	'</code></pre>',
	'}}',
	'',
	'После',
].join('\n');

describe('renderTextile macros', () => {
	it('renders {{collapse}} as <details> with the <pre> inside intact', () => {
		const html = renderTextile(SQL_COLLAPSE);
		expect(html).toContain('<details class="redmine-collapse">');
		expect(html).toContain('<pre><code class="sql">\nSELECT a\n\nFROM t WHERE a &lt; b;\n</code></pre>');
		expect(html).not.toContain('{{collapse');
		expect(html).not.toContain('&lt;pre&gt;');
		expect(html).toContain('<p>Текст</p>');
		expect(html).toContain('<p>После</p>');
	});

	it('puts the collapse block in place of its paragraph, not inside it', () => {
		expect(renderTextile('{{collapse\nтекст\n}}')).toMatch(/^<details/);
	});

	it('renders textile inside the collapse body', () => {
		const html = renderTextile('{{collapse(Список)\n* один\n* два\n}}');
		expect(html).toContain('<li>один</li>');
		expect(html).toContain('<span class="redmine-collapse-show">Список</span>');
	});

	it('splits a label with a comma into show and hide labels, like Redmine', () => {
		const html = renderTextile('{{collapse(SQL: проверка перед выкаткой, 18 строк)\nx\n}}');
		expect(html).toContain('<span class="redmine-collapse-show">SQL: проверка перед выкаткой</span>');
		expect(html).toContain('<span class="redmine-collapse-hide">18 строк</span>');
	});

	it('closes a collapse at the first }} on its own line: Redmine has no nested collapses', () => {
		const html = renderTextile('{{collapse(A)\n{{collapse(B)\ninner\n}}\nafter\n}}');
		expect(html.match(/<details/g)).toHaveLength(1);
		expect(html).toContain('after');
	});

	it('renders several collapses in one file', () => {
		const html = renderTextile('{{collapse(A)\na\n}}\n\nмежду\n\n{{collapse(B)\nb\n}}');
		expect(html.match(/<details/g)).toHaveLength(2);
		expect(html).toContain('<p>между</p>');
	});

	it('renders a collapse in a CRLF file the same as in an LF one', () => {
		expect(renderTextile('{{collapse(A)\r\n* x\r\n}}\r\n\r\nb')).toBe(renderTextile('{{collapse(A)\n* x\n}}\n\nb'));
	});

	it('shows a macro inside <pre> or @code@ as written, like Redmine', () => {
		expect(renderTextile('<pre>\n{{collapse(A)\nx\n}}\n</pre>')).toContain('<pre>\n{{collapse(A)\nx\n}}\n</pre>');
		expect(renderTextile('@{{thumbnail(a.png)}}@')).toContain('<code>{{thumbnail(a.png)}}</code>');
	});

	it('prints an escaped macro as text without the !', () => {
		expect(renderTextile('!{{thumbnail(a.png)}}')).toBe('<p>{{thumbnail(a.png)}}</p>');
	});

	it('renders {{thumbnail}} inline as an image', () => {
		expect(renderTextile('Схема: {{thumbnail(schema.png, size=300)}}')).toBe(
			'<p>Схема: <img class="redmine-thumbnail" src="schema.png" alt="schema.png" style="max-width: 300px; max-height: 300px"></p>',
		);
	});

	it('renders a thumbnail inside a collapse', () => {
		expect(renderTextile('{{collapse(Скрин)\n{{thumbnail(a.png)}}\n}}')).toContain('<img class="redmine-thumbnail" src="a.png"');
	});

	it('leaves macros the preview does not know as text', () => {
		expect(renderTextile('{{toc}}')).toBe('<p>{{toc}}</p>');
	});

	it('does not touch text that only looks like the internal placeholder', () => {
		expect(renderTextile('redminemacro0e')).toBe('<p>redminemacro0e</p>');
	});
});
