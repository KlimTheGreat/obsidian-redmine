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
	}
}
