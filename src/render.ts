import textile from 'textile-js';

/** Textile source → HTML string. The result is NOT sanitized: insert it only via sanitizeHTMLToDom. */
export function renderTextile(source: string): string {
	// A leading BOM hides the first block's signature (`h2.`) from the parser.
	// `breaks: true` matches Redmine: a single newline inside a paragraph is a line break.
	return textile(source.replace(/^\uFEFF/, ''), { breaks: true });
}
