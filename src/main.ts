import { Notice, Plugin } from 'obsidian';
import { TEXTILE_EXTENSIONS, VIEW_TYPE_TEXTILE } from './constants';
import { TextileView } from './textile-view';

export default class RedminePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_TEXTILE, (leaf) => new TextileView(leaf));
		try {
			this.registerExtensions(TEXTILE_EXTENSIONS, VIEW_TYPE_TEXTILE);
		} catch (error) {
			// Another plugin already owns .textile — stay loaded, tell the user why files don't open here.
			console.error('Redmine: cannot register .textile extension', error);
			new Notice('Redmine: .textile files are already handled by another plugin.');
		}
		// No default hotkey (plugin guidelines); users can bind one, e.g. the Ctrl+E they use for notes.
		this.addCommand({
			id: 'toggle-textile-mode',
			name: 'Toggle preview and source',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(TextileView);
				if (!view) return false;
				if (!checking) view.toggleMode();
				return true;
			},
		});
	}
}
