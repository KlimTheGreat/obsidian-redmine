import { loadPrism, setIcon } from 'obsidian';

export interface PreviewContext {
	/** Attachment name from `!name!` or {{thumbnail(name)}} → a loadable URL, or null if there's no such image. */
	resolveImage(name: string): string | null;
}

interface Prism {
	highlightElement(element: Element): void;
}

const URL_SCHEME_RE = /^([a-z][a-z\d+.-]*:|\/\/)/i;
// Redmine's LINKS_RE (app/helpers/application_helper.rb), issue part only: #123, ##123, #123-6, #123#note-6; `!` escapes.
// A text node's start or end stands where Redmine sees a tag boundary, so both count as separators.
export const ISSUE_RE = /(^|[\s(,\-[>])(!)?(##?\d+(?:(?:#note)?-\d+)?)(?=[\p{P}\p{S}](?:[^A-Za-z0-9_/]|$)|\s|$)/gu;

/**
 * Moves attachment names out of `<img src>` before sanitizing: Obsidian's sanitizeHTMLToDom imports the result into the
 * live document, where a bare `src="скрин.png"` would already be fetched. textile-js always writes `src="…"`.
 */
export function deferImageSources(html: string): string {
	return html.replace(/(<img\b[^>]*?\s)src="([^"]*)"/gi, (all: string, head: string, src: string) =>
		src === '' || URL_SCHEME_RE.test(src) ? all : `${head}data-redmine-src="${src}"`);
}

/** Redmine-specific touches on sanitized preview content, done before it's attached to the page. */
export function enhancePreview(root: DocumentFragment, context: PreviewContext): void {
	resolveImages(root, context);
	markIssueRefs(root);
	prepareCodeBlocks(root);
}

/** Colours code blocks with Obsidian's own Prism, like fenced code in notes. */
export async function highlightCode(root: HTMLElement): Promise<void> {
	const blocks = root.querySelectorAll('pre > code[class*="language-"]');
	if (blocks.length === 0) return;
	const prism = (await loadPrism()) as Prism;
	blocks.forEach((code) => prism.highlightElement(code));
}

// In Redmine `!name.png!` and {{thumbnail}} name an attachment of the issue. Here the name is looked up in the vault;
// an image that isn't there becomes a placeholder, since it will only exist once uploaded to Redmine.
function resolveImages(root: DocumentFragment, context: PreviewContext): void {
	for (const img of Array.from(root.querySelectorAll('img[data-redmine-src]'))) {
		const name = decodeAttachmentName(img.getAttribute('data-redmine-src') ?? '');
		img.removeAttribute('data-redmine-src');
		const url = context.resolveImage(name);
		if (url) img.setAttribute('src', url);
		else img.replaceWith(attachmentPlaceholder(name));
	}
}

// Redmine matches attachments after CGI.unescape: `%20` and `+` are spaces. textile-js allows no spaces inside `!…!`,
// so this is the only way to name an image like Obsidian's "Pasted image ….png".
function decodeAttachmentName(name: string): string {
	try {
		return decodeURIComponent(name.replace(/\+/g, ' '));
	} catch {
		return name;
	}
}

function attachmentPlaceholder(name: string): HTMLElement {
	const placeholder = createSpan({ cls: 'redmine-attachment', attr: { title: 'Attachment, not found in the vault' } });
	setIcon(placeholder.createSpan({ cls: 'redmine-attachment-icon' }), 'image');
	placeholder.appendText(name);
	return placeholder;
}

// Issue references get a mark now and become links once the Redmine URL is configurable (stage 5).
// Like Redmine, text inside <pre>, <code> and existing links is left alone.
function markIssueRefs(root: DocumentFragment): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!node.parentElement?.closest('pre, code, a')) nodes.push(node as Text);
	}
	for (const node of nodes) {
		const text = node.data;
		const parts: (string | Node)[] = [];
		let last = 0;
		for (const match of text.matchAll(ISSUE_RE)) {
			const [, leading, escaped, ref] = match as unknown as [string, string, string | undefined, string];
			const start = match.index + leading.length;
			parts.push(text.slice(last, start));
			parts.push(escaped ? ref : createSpan({ cls: 'redmine-issue-ref', text: ref, attr: { 'data-issue': /\d+/.exec(ref)![0] } }));
			last = start + (escaped?.length ?? 0) + ref.length;
		}
		if (last === 0) continue;
		parts.push(text.slice(last));
		node.replaceWith(...parts);
	}
}

// Redmine writes `<pre><code class="sql">`; Prism wants `language-sql`. The newlines right inside <code> are
// part of the textile markup, not of the code.
function prepareCodeBlocks(root: DocumentFragment): void {
	for (const code of Array.from(root.querySelectorAll('pre > code'))) {
		code.textContent = (code.textContent ?? '').replace(/^\n/, '').replace(/\n$/, '');
		const language = code.classList[0];
		if (language && !language.startsWith('language-')) code.classList.add(`language-${language}`);
	}
}
