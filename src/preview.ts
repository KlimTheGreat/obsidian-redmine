import { setIcon } from 'obsidian';

export interface PreviewContext {
	/** Attachment name from `!name!` or {{thumbnail(name)}} → a loadable URL, or null if there's no such image. */
	resolveImage(name: string): string | null;
}

const URL_SCHEME_RE = /^([a-z][a-z\d+.-]*:|\/\/)/i;

/** Redmine-specific touches on sanitized preview content, done before it's attached to the page. */
export function enhancePreview(root: DocumentFragment, context: PreviewContext): void {
	resolveImages(root, context);
}

// In Redmine `!name.png!` and {{thumbnail}} name an attachment of the issue. Here the name is looked up in the vault;
// an image that isn't there becomes a placeholder, since it will only exist once uploaded to Redmine.
function resolveImages(root: DocumentFragment, context: PreviewContext): void {
	for (const img of Array.from(root.querySelectorAll('img'))) {
		const src = img.getAttribute('src') ?? '';
		if (src === '' || URL_SCHEME_RE.test(src)) continue;
		const url = context.resolveImage(src);
		if (url) img.setAttribute('src', url);
		else img.replaceWith(attachmentPlaceholder(src));
	}
}

function attachmentPlaceholder(name: string): HTMLElement {
	const placeholder = createSpan({ cls: 'redmine-attachment', attr: { title: 'Attachment, not found in the vault' } });
	setIcon(placeholder.createSpan({ cls: 'redmine-attachment-icon' }), 'image');
	placeholder.appendText(name);
	return placeholder;
}
