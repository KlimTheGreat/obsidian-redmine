import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { scanTextile, TextileSyntax } from './syntax';

// Re-scanned on every change: drafts are a few KB, a full scan takes well under a millisecond.
const syntaxField = StateField.define<TextileSyntax>({
	create: (state) => scanTextile(state.doc.toString()),
	update: (syntax, tr) => (tr.docChanged ? scanTextile(tr.state.doc.toString()) : syntax),
});

const HIDDEN = Decoration.replace({});
const marks = new Map<string, Decoration>();
const lines = new Map<string, Decoration>();

class MarkerWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	eq(other: MarkerWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		return createSpan({ cls: 'redmine-list-bullet', text: this.text });
	}
}

/**
 * Textile styling for the editor. `live`: markup (`*`, `h2. `, link urls, list markers) is hidden on every line that
 * no cursor or selection touches, like Obsidian's live preview; otherwise all markup stays visible, only styled.
 */
export function textileDecorations(live: boolean): Extension {
	const decorations = StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, live),
		update: (value, tr) => (tr.docChanged || tr.selection ? buildDecorations(tr.state, live) : value),
		provide: (field) => EditorView.decorations.from(field),
	});
	return [syntaxField, decorations];
}

function buildDecorations(state: EditorState, live: boolean): DecorationSet {
	const syntax = state.field(syntaxField);
	const active = live ? activeLines(state) : null;
	const ranges: Range<Decoration>[] = [];
	for (const line of syntax.lines) ranges.push(cached(lines, line.cls, () => Decoration.line({ class: line.cls })).range(line.from));
	for (const range of syntax.ranges) {
		if (range.from >= range.to) continue;
		if (active && range.hide && !active.has(state.doc.lineAt(range.from).number)) {
			const hidden = range.widget ? Decoration.replace({ widget: new MarkerWidget(range.widget) }) : HIDDEN;
			ranges.push(hidden.range(range.from, range.to));
		} else {
			ranges.push(cached(marks, range.cls, () => Decoration.mark({ class: range.cls })).range(range.from, range.to));
		}
	}
	return Decoration.set(ranges, true);
}

function activeLines(state: EditorState): Set<number> {
	const active = new Set<number>();
	for (const { from, to } of state.selection.ranges) {
		for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) active.add(n);
	}
	return active;
}

function cached(cache: Map<string, Decoration>, cls: string, create: () => Decoration): Decoration {
	let decoration = cache.get(cls);
	if (!decoration) cache.set(cls, (decoration = create()));
	return decoration;
}
