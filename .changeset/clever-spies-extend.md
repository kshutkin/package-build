---
"create-pkgbld": minor
"create-pkgbld-extension-biome": patch
"pkgbld-plugin-dts-buddy": minor
"pkgbld-plugin-swc": patch
---

Add an extension system to `create-pkgbld` with interactive management and `list`, `add`, and `remove` subcommands. Extensions support dry runs, conflict detection, custom registries, optional dependency installation, and atomic file updates.

Publish built-in integrations for Biome, the SWC build plugin, and the dts-buddy build plugin.

Require modern PKG BLD plugins to declare their compatible `pkgbld` host range as a peer dependency.
