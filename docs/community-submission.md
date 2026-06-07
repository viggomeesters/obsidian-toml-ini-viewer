# Community Submission Notes

## Scope

TOML INI Viewer supports `.toml` and `.ini` files. It does not cover XLSX, XML, CSV, TSV, JSON, YAML, HTML, or log files.

## Safety

- Read-only viewer.
- No file write-back.
- No network requests.
- No clipboard access.
- No content execution.
- Source view remains available if parser errors occur.

## Review Checks

```bash
npm run typecheck
npm test
npm run build
```

## Release Assets

- `main.js`
- `manifest.json`
- `styles.css`

