import textile from 'textile-js';
import { collapseHtml, escapeHtml, parseMacroArgs, thumbnailHtml } from './macros';

// Redmine's MACROS_RE (app/helpers/application_helper.rb): optional `!` escape, name, optional (args) on one line,
// optional block of text between newlines. The block is lazy, so the first `}}` on its own line closes it: no nesting.
export const MACRO_RE = /(!)?\{\{(\w+)(?:\(([^\n\r]*?)\))?([\n\r][\s\S]*?[\n\r])?\}\}/g;
// Placeholder for a caught macro: plain lowercase letters and digits, which textile-js passes through untouched.
const TOKEN_RE = /<p>redminemacro(\d+)e<\/p>|redminemacro(\d+)e/g;
const PRE_TAG_RE = /(<\/?(?:pre|code)\b[^>]*>)/i;

interface CaughtMacro {
	/** The macro exactly as written, shown as text inside <pre>/<code>. */
	source: string;
	html: string;
	/** Block-level HTML replaces its whole <p> instead of sitting inside it. */
	block: boolean;
}

/** Textile source → HTML string. The result is NOT sanitized: insert it only via sanitizeHTMLToDom. */
export function renderTextile(source: string): string {
	// A leading BOM hides the first block's signature (`h2.`) from the parser. CRLF only for rendering; the file keeps it.
	const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const macros: CaughtMacro[] = [];
	// Like Redmine: macros are cut out before textile and put back into its output (catch_macros / inject_macros).
	const withTokens = text.replace(MACRO_RE, (all: string, escaped: string | undefined, name: string, args: string | undefined, block: string | undefined) => {
		const macro = expandMacro(all, escaped !== undefined, name.toLowerCase(), args ?? '', block);
		if (!macro) return all;
		macros.push(macro);
		return `redminemacro${macros.length - 1}e`;
	});
	// `breaks: true` matches Redmine: a single newline inside a paragraph is a line break.
	return injectMacros(textile(protectIssueRefs(withTokens), { breaks: true }), macros);
}

/** Macros this plugin runs like Redmine; any other `{{name}}` stays text, as in Redmine without that plugin. */
export function isKnownMacro(name: string): boolean {
	return name === 'collapse' || name === 'thumbnail';
}

function expandMacro(all: string, escaped: boolean, name: string, args: string, block: string | undefined): CaughtMacro | null {
	if (!isKnownMacro(name)) return null;
	// `!{{…}}` prints the macro as text, without the `!`.
	if (escaped) return { source: all, html: escapeHtml(all.slice(1)), block: false };
	if (name === 'collapse') {
		return { source: all, html: collapseHtml(parseMacroArgs(args), renderTextile((block ?? '').trim())), block: true };
	}
	return { source: all, html: thumbnailHtml(parseMacroArgs(args)), block: false };
}

// textile-js reads `#123 text` at a line start as a numbered list starting at 123; Redmine's parser wants a space
// after `#` and keeps it a paragraph with an issue link. The entity renders as `#`, also inside <pre> and @code@.
function protectIssueRefs(text: string): string {
	return text.replace(/^#(?=\d)/gm, '&#35;');
}

// Redmine's parse_non_pre_blocks: inside <pre>/<code> a macro is not executed and shows as written.
function injectMacros(html: string, macros: CaughtMacro[]): string {
	const openTags: string[] = [];
	return html.split(PRE_TAG_RE).map((part, i) => {
		if (i % 2 === 1) {
			const [, closing, tag] = /^<(\/)?(\w+)/.exec(part)!;
			const name = tag!.toLowerCase();
			if (!closing) openTags.push(name);
			else if (openTags[openTags.length - 1] === name) openTags.pop();
			return part;
		}
		return part.replace(TOKEN_RE, (all: string, wrapped: string | undefined, bare: string | undefined) => {
			const macro = macros[Number(wrapped ?? bare)];
			if (!macro) return all;
			if (openTags.length > 0) return escapeHtml(macro.source);
			if (wrapped === undefined || macro.block) return macro.html;
			return `<p>${macro.html}</p>`;
		});
	}).join('');
}
