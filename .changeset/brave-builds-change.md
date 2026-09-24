---
"pkgbld": major
---

Modernize the build runtime and publish source-backed ESM and type entry points, including the new `pkgbld/options` export.

Remove the `pkgbld prune` command in favor of the dedicated `pkgprn` package, remove the built-in TypeScript transform in favor of `pkgbld-plugin-swc`, and remove the `noSubpackages` option.

Resolve Build configuration from package metadata, explicit CLI options, and Build plugin overrides before package processing. Plugins now configure a typed mutable draft, receive typed source provenance and build-scoped shared state, and consume a normalized, validated, deeply frozen configuration in later lifecycle phases.
