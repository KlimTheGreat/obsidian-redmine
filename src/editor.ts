import { Annotation, ChangeSpec, Compartment, EditorState, Extension, Text, Transaction, TransactionSpec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { textileDecorations } from './editor-decorations';

export interface TextileEditorOptions {
	live: boolean;
	/** Called with the full text, line breaks as in the file, after every edit made in the editor. */
	onChange(text: string): void;
}

// Marks a change that came from disk: it isn't reported back and stays out of the undo history.
const fromDisk = Annotation.define<boolean>();

/** CodeMirror 6 editor for one textile file, styled like Obsidian's markdown editor. */
export class TextileEditor {
	readonly view: EditorView;
	// Textile styling, swapped when live preview is switched on or off.
	private readonly styling = new Compartment();
	private readonly host: HTMLElement;
	private live: boolean;

	constructor(parent: HTMLElement, text: string, private readonly options: TextileEditorOptions) {
		this.live = options.live;
		// Obsidian's editor classes: its theme then styles headings, bold, code lines and the scroller for us.
		this.host = parent.createDiv({ cls: 'markdown-source-view cm-s-obsidian mod-cm6 redmine-textile-editor' });
		this.host.toggleClass('is-live-preview', this.live);
		this.view = new EditorView({ parent: this.host, state: this.createState(text) });
	}

	/** The text exactly as the file should store it: the file's own line breaks. */
	get text(): string {
		return this.view.state.sliceDoc();
	}

	/**
	 * A change made on disk. Only the changed part is replaced, so the caret, scroll and undo history of
	 * the user's own edits survive; the change itself can't be undone from here.
	 */
	setText(text: string): void {
		if (text === this.text) return;
		const state = this.view.state;
		// The file switched between CRLF and LF: positions can't be mapped, start over with the new text.
		if (lineBreakOf(text) !== state.lineBreak) {
			this.view.setState(this.createState(text));
			return;
		}
		this.view.dispatch(replaceChanged(state, state.toText(text)));
		if (this.text !== text) this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: state.toText(text) }, annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)] });
	}

	setLive(live: boolean): void {
		if (live === this.live) return;
		this.live = live;
		this.host.toggleClass('is-live-preview', live);
		this.view.dispatch({ effects: this.styling.reconfigure(this.stylingFor(live)) });
	}

	focus(): void {
		this.view.focus();
	}

	destroy(): void {
		this.view.destroy();
		this.host.remove();
	}

	private stylingFor(live: boolean): Extension {
		return textileDecorations(live);
	}

	private createState(text: string): EditorState {
		const extensions: Extension[] = [
			// Only the file's own line break splits lines, so a stray `\r` or `\n` stays in the text byte for byte.
			EditorState.lineSeparator.of(lineBreakOf(text)),
			normalizeInsertedLineBreaks,
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
			EditorView.lineWrapping,
			EditorView.contentAttributes.of({ spellcheck: 'false' }),
			this.styling.of(this.stylingFor(this.live)),
			EditorView.updateListener.of((update) => {
				if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromDisk))) this.options.onChange(this.text);
			}),
		];
		return EditorState.create({ doc: text, extensions });
	}
}

function lineBreakOf(text: string): string {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

// Smallest single change from the current text to `next`: common start and end are kept.
function replaceChanged(state: EditorState, next: Text): TransactionSpec {
	const before = state.doc.toString();
	const after = next.toString();
	let start = 0;
	while (start < before.length && start < after.length && before.charCodeAt(start) === after.charCodeAt(start)) start++;
	let end = 0;
	while (end < before.length - start && end < after.length - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
	return {
		changes: { from: start, to: before.length - end, insert: next.slice(start, after.length - end) },
		annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
	};
}

// Pasted or dropped text may carry the other kind of line break (or a lone `\r`); the file keeps only its own kind.
const normalizeInsertedLineBreaks = EditorState.transactionFilter.of((tr) => {
	if (!tr.docChanged || tr.annotation(fromDisk)) return tr;
	let mixed = false;
	tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
		for (const line of inserted.iterLines()) if (/[\r\n]/.test(line)) mixed = true;
	});
	if (!mixed) return tr;
	const start = tr.startState;
	const changes: ChangeSpec[] = [];
	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		changes.push({ from: fromA, to: toA, insert: start.toText(inserted.toString().replace(/\r\n?/g, '\n').split('\n').join(start.lineBreak)) });
	});
	const changeSet = start.changes(changes);
	return {
		changes: changeSet,
		selection: start.selection.map(changeSet, 1),
		scrollIntoView: tr.scrollIntoView,
		annotations: tr.annotation(Transaction.userEvent) ? [Transaction.userEvent.of(tr.annotation(Transaction.userEvent)!)] : [],
	};
});
