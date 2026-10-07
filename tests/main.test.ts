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
		expect(plugin.extensions.get('textile')).toBe('other-plugin-view');
		expect(plugin.views.has(VIEW_TYPE_TEXTILE)).toBe(true);
	});

	it('adds a toggle command that works only in a textile view', async () => {
		const plugin = new RedminePlugin();
		await plugin.onload();
		const command = plugin.commands.find((c) => c.id === 'toggle-textile-mode');
		expect(command?.name).toBe('Toggle reading and editing');

		expect(command?.checkCallback?.(true)).toBe(false);

		const view = new TextileView(new WorkspaceLeaf());
		plugin.app.workspace.activeView = view;
		expect(command?.checkCallback?.(true)).toBe(true);
		expect(view.mode).toBe('live');
		command?.checkCallback?.(false);
		expect(view.mode).toBe('preview');
	});

	it('adds a live preview command that works only while editing a textile file', async () => {
		const plugin = new RedminePlugin();
		await plugin.onload();
		const command = plugin.commands.find((c) => c.id === 'toggle-live-preview');
		expect(command?.name).toBe('Toggle live preview and source');

		expect(command?.checkCallback?.(true)).toBe(false);

		const view = new TextileView(new WorkspaceLeaf());
		plugin.app.workspace.activeView = view;
		expect(command?.checkCallback?.(true)).toBe(true);
		command?.checkCallback?.(false);
		expect(view.mode).toBe('source');
		view.setMode('preview');
		expect(command?.checkCallback?.(true)).toBe(false);
	});
});
