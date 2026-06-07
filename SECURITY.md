# Security

TOML INI Viewer is read-only. It does not write back to source files, normalize configuration, make network requests, or execute content from opened files.

## Parser Dependencies

- TOML is parsed with `smol-toml`, a small TOML parser dependency.
- INI is parsed by a local conservative parser so duplicate keys, comments, malformed lines, and ambiguous sections can be reported as warnings without hiding the raw source.

The source view is always available. If parsing fails, the plugin shows the parser error and keeps the raw file readable.

## Reporting

Please report vulnerabilities privately by opening a GitHub security advisory or contacting the repository owner.

