// Redmine macros the preview understands, ported from lib/redmine/wiki_formatting/macros.rb.
// Each function returns an HTML string; render.ts decides where it goes.

export function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Macro arguments as Redmine's exec_macro splits them: by commas outside double quotes, quotes stripped, `""` → `"`. */
export function parseMacroArgs(args: string): string[] {
	const parts = args
		.split(/\s*,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)
		.map((arg) => arg.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
	// Ruby's String#split drops trailing empty strings: "" → [], "a," → ["a"].
	while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
	return parts;
}

/** `{{collapse(Show label, Hide label)}}`: Redmine shows the first label while closed and the second while open. */
export function collapseHtml(args: string[], bodyHtml: string): string {
	const show = args[0] ?? 'Show';
	const hide = args[1] ?? args[0] ?? 'Hide';
	return '<details class="redmine-collapse"><summary>'
		+ `<span class="redmine-collapse-show">${escapeHtml(show)}</span>`
		+ `<span class="redmine-collapse-hide">${escapeHtml(hide)}</span>`
		+ `</summary>\n<div class="redmine-collapse-body">\n${bodyHtml}\n</div></details>`;
}

/**
 * `{{thumbnail(file.png, size=300, title=Text)}}` → an <img> fitted into size×size (default 200), like Redmine's thumbnail.
 * `src` is the attachment name; the preview later swaps it for the vault file or a placeholder.
 */
export function thumbnailHtml(macroArgs: string[]): string {
	const args = [...macroArgs];
	const options = extractMacroOptions(args, ['size', 'title']);
	const filename = args[0];
	if (!filename?.trim()) return macroErrorHtml('thumbnail', 'Filename required');
	if (options.size !== undefined && !/^\d+$/.test(options.size)) return macroErrorHtml('thumbnail', 'Invalid size parameter');
	const size = Number(options.size ?? 0) > 0 ? Number(options.size) : 200;
	const title = options.title ? ` title="${escapeHtml(options.title)}"` : '';
	return `<img class="redmine-thumbnail" src="${escapeHtml(filename)}" alt="${escapeHtml(filename)}"${title}`
		+ ` style="max-width: ${size}px; max-height: ${size}px">`;
}

// Redmine's extract_macro_options: trailing `key=value` arguments with a known key become options.
function extractMacroOptions(args: string[], keys: string[]): Record<string, string> {
	const options: Record<string, string> = {};
	for (;;) {
		const match = /^(.+?)=(.+)$/.exec((args[args.length - 1] ?? '').trim());
		if (!match || !keys.includes(match[1]!.toLowerCase())) return options;
		options[match[1]!.toLowerCase()] = match[2]!.replace(/^"(.*)"$/, '$1');
		args.pop();
	}
}

// Same text Redmine shows when a macro raises (error_can_not_execute_macro_html).
function macroErrorHtml(name: string, error: string): string {
	return `<p class="redmine-macro-error">Error executing the <strong>${name}</strong> macro (${escapeHtml(error)})</p>`;
}
