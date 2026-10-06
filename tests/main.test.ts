import { beforeEach, describe, expect, it } from 'vitest';
import { notices, WorkspaceLeaf } from 'obsidian';
import RedminePlugin from '../src/main';
import { TextileView } from '../src/textile-view';
import { VIEW_TYPE_TEXTILE } from '../src/constants';

describe('RedminePlugin.onload', () => {
	beforeEach(() => {
		notices.length = 0;
	});

	it('registers the textile view', async () => {
		const plugin = new RedminePlugin();
		await plugin.onload();
		const creator = plugin.views.get(VIEW_TYPE_TEXTILE);
		expect(creator).toBeDefined();
		expect(creator?.(new WorkspaceLeaf())).toBeInstanceOf(TextileView);
	});

	it('maps .textile files to the textile view', async () => {
		const plugin = new RedminePlugin();
		await plugin.onload();
		expect(plugin.extensions.get('textile')).toBe(VIEW_TYPE_TEXTILE);
	});

	it('keeps loading and shows a notice when .textile is already taken', async () => {
		const plugin = new RedminePlugin();
		plugin.extensions.set('textile', 'other-plugin-view');
		await expect(plugin.onload()).resolves.toBeUndefined();
		expect(notices).toEqual(['Redmine: .textile files are already handled by another plugin.']);
	});
});
