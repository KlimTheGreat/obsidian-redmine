import { isKnownMacro, MACRO_RE } from './render';
import { scanInline, SyntaxRange } from './syntax-inline';

export type { SyntaxRange } from './syntax-inline';

/** A class for a whole line, given by the position where the line starts. */
export interface SyntaxLine {
	from: number;
	cls: string;
}

export interface TextileSyntax {
	lines: SyntaxLine[];
	ranges: SyntaxRange[];
}

// Block rules of textile-js (src/textile/flow.js, list.js, table.js), read line by line.
const ATTR = '(?:\\([^)]+\\)|\\{[^}]+\\}|\\[[^[\\]]+\\]|<>|<|>|=|[()]+)*';
const BLOCKS = '(?:b[qc]|div|notextile|pre|h[1-6]|fn\\d+|p|###)';
const SIGNATURE_RE = new RegExp(`^(${BLOCKS})${ATTR}\\.(\\.?)(?:\\s|(?=:)|$)`);
const SIGNATURE_AHEAD_RE = new RegExp(`^${BLOCKS}${ATTR}\\.`);
const LIST_START_RE = new RegExp(`^[\\t ]*(?:\\*|#(?:_|\\d+)?)${ATTR}(?: +\\S|\\.\\s*\\S)`);
const LIST_ITEM_RE = new RegExp(`^[\\t ]*([#*]*(?:\\*|#(?:_|\\d+)?))${ATTR}(?: +|\\.\\s*)(?=\\S)`);
const TABLE_ROW_RE = new RegExp(`^(?:${ATTR}\\.[^\\S\\n]*)?\\|.*\\|[^\\S\\n]*$`);
const CELL_ATTR_RE = /^(?:[_<>=^~-]|[\\/]\d+|\([^)]*\)|\{[^}]*\}|\[[^\]]*\])+\. ?/;
const RULER_RE = /^(?:---+|\*\*\*+|___+)$/;
const HTML_BLOCK_RE = /^<(pre|notextile)\b[^>]*>/i;
const PRE_TAG_RE = /<\/?(?:pre|code)\b[^>]*>/gi;
const MARKUP = 'cm-formatting';
const CODE_LINE = 'HyperMD-codeblock redmine-code-line';

/** Finds what to style in a textile document. `text` uses `\n` line breaks, so offsets match the editor's positions. */
export function scanTextile(text: string): TextileSyntax {
	const out: TextileSyntax = { lines: [], ranges: [] };
	// renderTextile drops a leading BOM before parsing: here it's skipped, so `h2.` on the first line still counts.
	const bom = text.startsWith('\uFEFF') ? 1 : 0;
	scanBlocks(text.slice(bom), bom, out);
	// A line class belongs where the line starts, before the BOM.
	for (const line of out.lines) if (line.from === bom) line.from = 0;
	return out;
}

function scanBlocks(text: string, offset: number, out: TextileSyntax): void {
	const lines = blankOutMacros(text, offset, out).split('\n');
	const starts: number[] = [];
	let pos = offset;
	for (const line of lines) {
		starts.push(pos);
		pos += line.length + 1;
	}
	const block = new BlockScanner(lines, starts, out);
	let i = 0;
	while (i < lines.length) i = block.next(i);
}

// Like Redmine, macros are cut out before textile: their text becomes blank for the block rules, a collapse body is
// scanned as a document of its own.
function blankOutMacros(text: string, offset: number, out: TextileSyntax): string {
	return text.replace(MACRO_RE, (all: string, escaped: string | undefined, name: string, _args: string | undefined, body: string | undefined, at: number) => {
		if (!isKnownMacro(name.toLowerCase())) return all;
		const from = offset + at;
		if (body !== undefined && escaped === undefined) {
			const head = all.length - body.length - 2;
			out.ranges.push({ from, to: from + head, cls: 'redmine-macro' });
			scanBlocks(body, from + head, out);
			out.ranges.push({ from: from + all.length - 2, to: from + all.length, cls: 'redmine-macro' });
		} else {
			out.ranges.push({ from, to: from + all.length, cls: 'redmine-macro' });
		}
		return all.replace(/[^\n]/g, ' ');
	});
}

class BlockScanner {
	constructor(
		private readonly lines: string[],
		private readonly starts: number[],
		private readonly out: TextileSyntax,
	) {}

	/** Styles the block that starts at line `i` and returns the index of the line after it. */
	next(i: number): number {
		const line = this.lines[i]!;
		if (isBlank(line)) return i + 1;
		const signature = SIGNATURE_RE.exec(line);
		if (signature) return this.namedBlock(i, signature[0], signature[1]!, signature[2] === '.');
		const html = this.htmlBlock(i);
		if (html !== null) return html;
		if (RULER_RE.test(line) && (i + 1 >= this.lines.length || /^\s/.test(this.lines[i + 1]!) || isBlank(this.lines[i + 1]!))) {
			this.range(i, 0, line.length, MARKUP);
			return i + 1;
		}
		if (isListStart(line)) return this.list(i);
		if (TABLE_ROW_RE.test(line)) return this.table(i);
		const end = this.paragraphEnd(i);
		for (let k = i; k < end; k++) this.inline(k, 0);
		return end;
	}

	private namedBlock(i: number, signature: string, type: string, extended: boolean): number {
		const code = type === 'bc' || type === 'pre';
		const end = extended ? this.extendedEnd(i, code) : code ? this.blankEnd(i) : this.paragraphEnd(i);
		const footnote = type.startsWith('fn');
		this.out.ranges.push({ from: this.starts[i]!, to: this.starts[i]! + signature.length, cls: `${MARKUP} redmine-signature`, hide: !footnote });
		const header = /^h([1-6])$/.exec(type);
		const lineClass = header ? `HyperMD-header HyperMD-header-${header[1]}` : type === 'bq' ? 'HyperMD-quote redmine-quote' : code ? CODE_LINE : '';
		const raw = code || type === 'notextile' || type === '###';
		for (let k = i; k < end; k++) {
			if (lineClass) this.line(k, lineClass);
			if (type === '###') this.range(k, 0, this.lines[k]!.length, 'cm-comment');
			else if (!raw) this.inline(k, k === i ? signature.length : 0);
		}
		return end;
	}

	// <pre> and <notextile> blocks run to their closing tag, which must end its line (else textile-js reads a paragraph).
	private htmlBlock(i: number): number | null {
		const line = this.lines[i]!;
		const comment = /^<!--/.test(line);
		const open = HTML_BLOCK_RE.exec(line);
		if (!comment && !open) return null;
		const closeRe = comment ? /-->/ : new RegExp(`</${open![1]}\\s*>`, 'i');
		for (let k = i; k < this.lines.length; k++) {
			const searchFrom = k === i ? (comment ? 4 : open![0].length) : 0;
			const close = closeRe.exec(this.lines[k]!.slice(searchFrom));
			if (!close) continue;
			if (!isBlank(this.lines[k]!.slice(searchFrom + close.index + close[0].length))) return null;
			for (let j = i; j <= k; j++) {
				if (comment) this.range(j, 0, this.lines[j]!.length, 'cm-comment');
				else if (open![1]!.toLowerCase() === 'pre') this.preLine(j);
			}
			return k + 1;
		}
		return null;
	}

	private preLine(k: number): void {
		this.line(k, CODE_LINE);
		for (const m of this.lines[k]!.matchAll(PRE_TAG_RE)) this.range(k, m.index, m.index + m[0].length, `${MARKUP} redmine-html`);
	}

	private list(i: number): number {
		const counters: number[] = [];
		let depth = 1;
		let k = i;
		for (; k < this.lines.length && !isBlank(this.lines[k]!); k++) {
			const line = this.lines[k]!;
			const item = isIssueLine(line) ? null : LIST_ITEM_RE.exec(line);
			let from = 0;
			if (item) {
				const marker = item[1]!;
				depth = Math.min(marker.length, 6);
				counters.length = depth;
				const numbered = marker.endsWith('#');
				counters[depth - 1] = numbered ? (counters[depth - 1] ?? 0) + 1 : 0;
				const widget = numbered ? `${counters[depth - 1]}.` : '•';
				this.out.ranges.push({ from: this.starts[k]!, to: this.starts[k]! + item[0].length, cls: `${MARKUP} redmine-list-marker`, hide: true, widget });
				from = item[0].length;
			}
			this.line(k, `redmine-list-line redmine-list-${depth}`);
			this.inline(k, from);
		}
		return k;
	}

	private table(i: number): number {
		let k = i;
		for (; k < this.lines.length && TABLE_ROW_RE.test(this.lines[k]!); k++) {
			this.line(k, 'redmine-table-line');
			const line = this.lines[k]!;
			let cellFrom = line.indexOf('|');
			this.range(k, 0, cellFrom + 1, MARKUP);
			while (cellFrom >= 0) {
				const next = line.indexOf('|', cellFrom + 1);
				if (next < 0) break;
				const attr = CELL_ATTR_RE.exec(line.slice(cellFrom + 1, next));
				const textFrom = cellFrom + 1 + (attr ? attr[0].length : 0);
				if (attr) this.range(k, cellFrom + 1, textFrom, MARKUP);
				scanInline(line.slice(textFrom, next), this.starts[k]! + textFrom, this.out.ranges);
				this.range(k, next, next + 1, MARKUP);
				cellFrom = next;
			}
		}
		return k;
	}

	// A paragraph (or a one-dot block) ends at a blank line or where a list starts.
	private paragraphEnd(i: number): number {
		let k = i + 1;
		while (k < this.lines.length && !isBlank(this.lines[k]!) && !isListStart(this.lines[k]!)) k++;
		return k;
	}

	// bc. and pre. end at a blank line only.
	private blankEnd(i: number): number {
		let k = i + 1;
		while (k < this.lines.length && !isBlank(this.lines[k]!)) k++;
		return k;
	}

	// bc.. and friends run, blank lines included, up to the next block signature (non-code ones also stop at a list).
	private extendedEnd(i: number, code: boolean): number {
		let k = i + 1;
		while (k < this.lines.length && !SIGNATURE_AHEAD_RE.test(this.lines[k]!) && (code || !isListStart(this.lines[k]!))) k++;
		while (k - 1 > i && isBlank(this.lines[k - 1]!)) k--;
		return k;
	}

	private inline(k: number, from: number): void {
		scanInline(this.lines[k]!.slice(from), this.starts[k]! + from, this.out.ranges);
	}

	private line(k: number, cls: string): void {
		this.out.lines.push({ from: this.starts[k]!, cls });
	}

	private range(k: number, from: number, to: number, cls: string): void {
		if (to > from) this.out.ranges.push({ from: this.starts[k]! + from, to: this.starts[k]! + to, cls });
	}
}

function isBlank(line: string): boolean {
	return /^\s*$/.test(line);
}

// renderTextile writes `#123` at a line start as `&#35;123` (an issue reference, not a list starting at 123).
function isIssueLine(line: string): boolean {
	return /^#\d/.test(line);
}

function isListStart(line: string): boolean {
	return !isIssueLine(line) && LIST_START_RE.test(line);
}
