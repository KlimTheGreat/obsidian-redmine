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

function refs(root: HTMLElement): string[] {
	return Array.from(root.querySelectorAll('.redmine-issue-ref'), (el) => el.textContent ?? '');
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

describe('enhancePreview issue references', () => {
	it('marks #123, ##123 and note references', () => {
		const root = show('См. #273318, ##273318, #273318-6 и #273318#note-6.');
		expect(refs(root)).toEqual(['#273318', '##273318', '#273318-6', '#273318#note-6']);
		expect(root.querySelector('.redmine-issue-ref')?.getAttribute('data-issue')).toBe('273318');
		expect(root.textContent).toBe('См. #273318, ##273318, #273318-6 и #273318#note-6.');
	});

	it('marks a reference at the start of a paragraph and inside formatting', () => {
		expect(refs(show('#1 первый\n\n*#2* жирный'))).toEqual(['#1', '#2']);
	});

	it('prints an escaped reference without the !', () => {
		const root = show('Не ссылка: !#123');
		expect(refs(root)).toEqual([]);
		expect(root.textContent).toBe('Не ссылка: #123');
	});

	it('ignores references inside code, <pre> and links', () => {
		expect(refs(show('@#1@\n\n<pre>\n#2\n</pre>\n\n"#3":https://x.y'))).toEqual([]);
	});

	it('ignores # inside words, URLs and numbers followed by letters', () => {
		expect(refs(show('a#1 http://x.y/#2 #3abc #4.5'))).toEqual([]);
	});
});
