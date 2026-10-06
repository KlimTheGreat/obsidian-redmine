# Redmine for Obsidian

Open Redmine textile files (`.textile`) right inside Obsidian instead of an external editor.

## Status

Early development. Current version shows the raw textile source in an Obsidian tab.
Planned: rendered preview with source/preview modes, Redmine macros (`{{collapse}}`, `{{thumbnail}}`),
settings, Redmine API integration.

## Development

```bash
npm install
npm test
npm run build
OBSIDIAN_VAULT="/path/to/vault" npm run install-vault
```

Then enable **Redmine** in **Settings → Community plugins**.
