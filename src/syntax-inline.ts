import { ISSUE_RE } from './preview';

/** A styled piece of the document. Positions are CodeMirror's: a line break counts as one character. */
export interface SyntaxRange {
	from: number;
	to: number;
	/** Classes for the text while it's shown. */
	cls: string;
	/** Markup that live preview hides while no cursor is on its line. */
	hide?: boolean;
	/** Shown instead of hidden markup, e.g. a bullet for `* `. */
	widget?: string;
}

// Inline rules of textile-js (src/textile/phrase.js), kept to what the editor styles: phrases, links, images, tags.
const PHRASE_START_RE = /^([[{]?)(__?|\*\*?|\?\?|[-+^~@%])/;
const PHRASE_CLASSES: Record<string, string> = {
	'*': 'cm-strong',
	'**': 'cm-strong',
	'_': 'cm-em',
	'__': 'cm-em',
	'-': 'cm-strikethrough',
	'+': 'redmine-ins',
	'^': 'redmine-sup',
	'~': 'redmine-sub',
	'??': 'redmine-cite',
	'%': 'redmine-span',
	'@': 'cm-inline-code',
};
// A phrase opens only after one of these (or at the start); textile-js calls it the boundary.
const BOUNDARY_RE = /[\s<>.,"'?!;:()[\]%{}]/;
const PHRASE_END = '(?=$|[\\s.,"\'!?;:()«»„“”‚‘’<>])';
const LINK_RE = /^"(?!\s)((?:[^"]|"(?![\s:])[^\n"]+"(?!:))+)":((?:[^\s()]|\([^\s()]+\)|[()])+?)(?=[!-.:-@[\\\]-`{-~]+(?:$|\s)|$|\s)/;
const LINK_TITLE_RE = /\s*\(((?:\([^()]*\)|[^()])+)\)$/;
const IMAGE_RE = /^!(?!\s)((?:\([^)]+\)|\{[^}]+\}|\[[^[\]]+\]|<>|<|>|=|[()]+)*(?:\.[^\n\S]|\.(?:[^./]))?)([^!\s]+?) ?(?:\(((?:[^()]|\([^()]+\))+)\))?!(?::([^\s]+?(?=[!-.:-@[\\\]-`{-~](?:$|\s)|\s|$)))?/;
const NOTEXTILE_RE = /^==(.*?)==/;
const COMMENT_RE = /^<!--.*?-->/;
const TAG_RE = /^<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/i;
const SINGLETON_TAGS = ['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'wbr'];
// Inline HTML that formats its text the way a phrase would.
const TAG_CLASSES: Record<string, string> = {
	b: 'cm-strong',
	strong: 'cm-strong',
	i: 'cm-em',
	em: 'cm-em',
	del: 'cm-strikethrough',
	s: 'cm-strikethrough',
	ins: 'redmine-ins',
	u: 'redmine-ins',
	sup: 'redmine-sup',
	sub: 'redmine-sub',
	cite: 'redmine-cite',
	code: 'cm-inline-code',
};
const MARKUP = 'cm-formatting';

/**
 * Styles the inline markup of one line of a textile block. `offset` is the document position of `text[0]`.
 * `issues: false` inside link text: Redmine doesn't turn `#123` into a link inside another link.
 */
export function scanInline(text: string, offset: number, out: SyntaxRange[], issues = true): void {
	let plainFrom = 0;
	let i = 0;
	while (i < text.length) {
		const behind = i === 0 ? '' : text.charAt(i - 1);
		const found = matchInline(text.slice(i), offset + i, behind === '' || BOUNDARY_RE.test(behind), issues);
		if (!found) {
			i++;
			continue;
		}
		if (issues) markIssueRefs(text.slice(plainFrom, i), offset + plainFrom, out);
		out.push(...found.ranges);
		i += found.length;
		plainFrom = i;
	}
	if (issues) markIssueRefs(text.slice(plainFrom), offset + plainFrom, out);
}

interface InlineMatch {
	length: number;
	ranges: SyntaxRange[];
}

// Same order as textile-js tries them.
function matchInline(rest: string, at: number, boundary: boolean, issues: boolean): InlineMatch | null {
	return matchNotextile(rest, at) ?? matchPhrase(rest, at, boundary, issues) ?? matchImage(rest, at)
		?? matchComment(rest, at) ?? matchTag(rest, at, issues) ?? (boundary ? matchLink(rest, at) : null);
}

function matchNotextile(rest: string, at: number): InlineMatch | null {
	const m = NOTEXTILE_RE.exec(rest);
	if (!m) return null;
	const end = at + m[0].length;
	return { length: m[0].length, ranges: [hidden(at, at + 2), hidden(end - 2, end)] };
}

function matchPhrase(rest: string, at: number, boundary: boolean, issues: boolean): InlineMatch | null {
	const m = PHRASE_START_RE.exec(rest);
	if (!m || !(boundary || m[1])) return null;
	const [head, fence, token] = m as unknown as [string, string, string];
	const code = token === '@';
	const open = head.length + (code ? 0 : phraseAttrLength(rest.slice(head.length), token));
	let middle: string;
	let end: string;
	if (fence === '[' || fence === '{') {
		middle = '^(.*?)';
		end = fence === '[' ? '(?:])' : '(?:})';
	} else {
		const first = escapeRegExp(token.charAt(0));
		middle = code ? '^(\\S+|\\S+.*?\\S)' : `^([^\\s${first}]+|[^\\s${first}].*?\\S(${first}*))`;
		end = PHRASE_END;
	}
	const close = new RegExp(`${middle}(${escapeRegExp(token)})${end}`).exec(rest.slice(open));
	if (!close || !close[1]) return null;
	const content = close[1];
	const contentFrom = at + open;
	const contentTo = contentFrom + content.length;
	const length = open + close[0].length;
	const ranges: SyntaxRange[] = [hidden(at, contentFrom), { from: contentFrom, to: contentTo, cls: PHRASE_CLASSES[token]! }];
	if (!code) scanInline(content, contentFrom, ranges, issues);
	ranges.push(hidden(contentTo, at + length));
	return { length, ranges };
}

// textile-js's parseAttr for phrases: {style} always, (class) not before a space or the closing token, [lang] not before it.
function phraseAttrLength(text: string, token: string): number {
	let length = 0;
	for (;;) {
		const rest = text.slice(length);
		const m = /^\{[^}]*\}/.exec(rest) ?? /^\[[^[\]\n]+\]/.exec(rest) ?? /^\([^()\n]+\)/.exec(rest);
		if (!m) return length;
		const next = rest.charAt(m[0].length);
		if (m[0].startsWith('[') && next === token.charAt(0)) return length;
		if (m[0].startsWith('(') && (next === token.charAt(0) || /\s/.test(next))) return length;
		length += m[0].length;
	}
}

function matchImage(rest: string, at: number): InlineMatch | null {
	const m = IMAGE_RE.exec(rest);
	if (!m) return null;
	return { length: m[0].length, ranges: [{ from: at, to: at + m[0].length, cls: `${MARKUP} redmine-image` }] };
}

function matchComment(rest: string, at: number): InlineMatch | null {
	const m = COMMENT_RE.exec(rest);
	if (!m) return null;
	return { length: m[0].length, ranges: [{ from: at, to: at + m[0].length, cls: 'cm-comment' }] };
}

// An inline HTML tag counts only with its closing tag on the same line, like textile-js; <code> keeps its text raw.
function matchTag(rest: string, at: number, issues: boolean): InlineMatch | null {
	const m = TAG_RE.exec(rest);
	if (!m) return null;
	const [open, closing, rawName, selfClosing] = m as unknown as [string, string, string, string];
	const name = rawName.toLowerCase();
	const tag = (from: number, to: number): SyntaxRange => ({ from, to, cls: `${MARKUP} redmine-html` });
	if (closing || selfClosing || SINGLETON_TAGS.includes(name)) return { length: open.length, ranges: [tag(at, at + open.length)] };
	const close = new RegExp(`</${name}\\s*>`, 'i').exec(rest.slice(open.length));
	if (!close) return null;
	const contentFrom = at + open.length;
	const contentTo = contentFrom + close.index;
	const ranges = [tag(at, contentFrom)];
	const cls = TAG_CLASSES[name];
	if (cls && contentTo > contentFrom) ranges.push({ from: contentFrom, to: contentTo, cls });
	if (name !== 'code' && name !== 'notextile') scanInline(rest.slice(open.length, open.length + close.index), contentFrom, ranges, issues);
	ranges.push(tag(contentTo, contentTo + close[0].length));
	return { length: open.length + close.index + close[0].length, ranges };
}

// "text(title)":url — the editor shows only the text; the quotes, title and url are markup.
function matchLink(rest: string, at: number): InlineMatch | null {
	const m = LINK_RE.exec(rest);
	if (!m) return null;
	const inner = m[1]!;
	const title = LINK_TITLE_RE.exec(inner);
	const textLength = title && title.index > 0 ? title.index : inner.length;
	const textFrom = at + 1;
	const textTo = textFrom + textLength;
	const end = at + m[0].length;
	const ranges: SyntaxRange[] = [hidden(at, textFrom), { from: textFrom, to: textTo, cls: 'cm-link' }];
	scanInline(inner.slice(0, textLength), textFrom, ranges, false);
	ranges.push({ from: textTo, to: end, cls: `${MARKUP} cm-url`, hide: true });
	return { length: m[0].length, ranges };
}

// Same marks as the preview's issue references (`#123`); an escaped `!#123` stays plain.
function markIssueRefs(text: string, offset: number, out: SyntaxRange[]): void {
	for (const m of text.matchAll(ISSUE_RE)) {
		if (m[2]) continue;
		const from = offset + m.index + m[1]!.length;
		out.push({ from, to: from + m[3]!.length, cls: 'redmine-issue-ref' });
	}
}

function hidden(from: number, to: number): SyntaxRange {
	return { from, to, cls: MARKUP, hide: true };
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}
