---
"pkgbld": major
---

Modernize the build runtime and publish source-backed ESM and type entry points, including the new `pkgbld/options` export.

Remove the `pkgbld prune` command in favor of the dedicated `pkgprn` package, remove the built-in TypeScript transform in favor of `pkgbld-plugin-swc`, and remove the `noSubpackages` option.
