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

	it('leaves Redmine macros as text until stage 3', () => {
		expect(renderTextile('{{collapse(Детали)\nтекст\n}}')).toContain('{{collapse(Детали)');
	});
});
