import { describe, expect, it } from 'vitest';
import { sanitizeHTMLToDom } from 'obsidian';
import { enhancePreview, PreviewContext } from '../src/preview';
import { renderTextile } from '../src/render';

const noImages: PreviewContext = { resolveImage: () => null };

// Renders textile the way the view does (render → sanitize → enhance) into a detached element.
function show(source: string, context: PreviewContext = noImages): HTMLElement {
	const content = sanitizeHTMLToDom(renderTextile(source));
	enhancePreview(content, context);
	const root = document.createElement('div');
	root.append(content);
	return root;
}

describe('enhancePreview images', () => {
	it('shows an attachment found in the vault', () => {
		const root = show('!скрин.png!', { resolveImage: (name) => (name === 'скрин.png' ? 'app://vault/Media/скрин.png' : null) });
		expect(root.querySelector('img')?.getAttribute('src')).toBe('app://vault/Media/скрин.png');
	});

	it('shows a placeholder with the name for an attachment that is not in the vault', () => {
		const root = show('Вот: !скрин.png!');
		expect(root.querySelector('img')).toBeNull();
		const placeholder = root.querySelector('.redmine-attachment');
		expect(placeholder?.textContent).toBe('скрин.png');
		expect(placeholder?.querySelector('.redmine-attachment-icon')).not.toBeNull();
	});

	it('resolves {{thumbnail}} images and keeps their size', () => {
		const root = show('{{thumbnail(a.png, size=300)}}', { resolveImage: () => 'app://vault/a.png' });
		const img = root.querySelector('img.redmine-thumbnail');
		expect(img?.getAttribute('src')).toBe('app://vault/a.png');
		expect(img?.getAttribute('style')).toBe('max-width: 300px; max-height: 300px');
	});

	it('leaves web and data images alone', () => {
		const asked: string[] = [];
		const root = show('!https://example.com/a.png!', { resolveImage: (name) => (asked.push(name), null) });
		expect(root.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
		expect(asked).toEqual([]);
	});
});
