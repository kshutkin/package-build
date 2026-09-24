---
"pkgbld": major
---

Modernize the build runtime and publish source-backed ESM and type entry points, including the new `pkgbld/options` export.

Remove the `pkgbld prune` command in favor of the dedicated `pkgprn` package, remove the built-in TypeScript transform in favor of `pkgbld-plugin-swc`, and remove the `noSubpackages` option.

Resolve Build configuration from package metadata, explicit CLI options, and Build plugin overrides before package processing. Plugins now configure a typed mutable draft, receive typed source provenance and build-scoped shared state, and consume a normalized, validated, deeply frozen configuration in later lifecycle phases.

Replace correlated input paths and extension maps with immutable Build entries. Build plugins contribute additional entries through a dedicated lifecycle phase, and invalid UMD or preprocessing selections now fail before Rollup planning.

Resolve Build plugins from the package that declares them and fail the build when a declared plugin cannot be loaded.
