// Copies the built plugin into a vault for manual testing: OBSIDIAN_VAULT="/path/to/vault" npm run install-vault
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const vault = process.env.OBSIDIAN_VAULT;
if (!vault || !existsSync(join(vault, '.obsidian'))) {
	console.error('Set OBSIDIAN_VAULT to a vault folder (it must contain .obsidian/).');
	process.exit(1);
}

const { id } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const target = join(vault, '.obsidian', 'plugins', id);
mkdirSync(target, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	copyFileSync(file, join(target, file));
}
console.log(`Installed ${id} into ${target}`);
