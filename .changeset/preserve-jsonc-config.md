---
'pkgbld': minor
---

Discover and resolve TypeScript and JavaScript configurations with get-tsconfig, including inherited settings. Apply config-hook edits without flattening extends, preserve JSONC comments and formatting, update the correct local config file, and create local overrides instead of editing shared ancestor configs. Authored syntax errors and inheritance-resolution errors are reported instead of replacing configs with defaults.

Expose shared JSON/JSONC parsing and comment-preserving editing helpers through pkgbld/json and config discovery through pkgbld/tsconfig.
