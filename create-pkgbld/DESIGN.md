# Create PKG BLD Package Management Design

**Status:** Initial lock stage implemented
**Scope:** `create-pkgbld` package discovery and management  
**Last updated:** 2026-09-20

This document defines how `create-pkgbld` discovers and manages packages in
the PKG BLD ecosystem. It is intentionally scenario-based so that additional
package-management cases can be added without changing the terminology or the
core rules.

## Goals

- Present one coherent add/remove interface for project features.
- Distinguish build plugins from setup-only extensions.
- Recognize installed third-party PKG BLD plugins without requiring registry
  metadata or an extension export.
- Keep official package metadata in `create-pkgbld` without bundling extension
  implementations with the CLI.
- Avoid executing third-party code merely to build the package list.

## Non-goals

- Searching npm for arbitrary PKG BLD plugins.
- Making an uninstalled third-party package available again without registry
  metadata.
- Defining the runtime plugin API. That contract belongs to `pkgbld`.
- Treating every installed development tool as a PKG BLD package.

## Terminology

### Build plugin

An npm package loaded by `pkgbld` during a build. Its package name must match
one of these patterns:

```text
pkgbld-plugin-<name>
@<scope>/pkgbld-plugin-<name>
```

The package exports the PKG BLD runtime plugin API. Naming is the discovery
contract: an additional `create-pkgbld` configuration or `/extension` export
is not required for the plugin to work.

### Extension

An npm package containing setup and removal behavior for `create-pkgbld`.
Extensions may add dependencies, scripts, configuration files, or package
metadata. They are discovered through registry metadata because their purpose
cannot be inferred from their package name alone.

The recommended package-name patterns are:

```text
create-pkgbld-extension-<name>
@<scope>/create-pkgbld-extension-<name>
```

### Official registry

Metadata bundled with `create-pkgbld` describing packages that the project
officially offers for installation. The registry contains names, package
specifiers, versions, descriptions, and tags. Extension implementation code is
downloaded to the internal cache only when it is selected.

### Project lock

The generated, committed `.pkgbld-lock.json` file. It records integrations the
project acknowledges as applied, including plugins installed manually and later
adopted by `create-pkgbld`. It is applied state, not a catalog of packages that
might be installed.

### Discovered plugin

An installed build plugin found directly in the target project's dependency
fields. It may have no official entry or project-lock record.

## Core rules

1. A build plugin is identified by its complete npm package name. The optional
   scope does not change the required `pkgbld-plugin-` prefix.
2. `pkgbld` and `create-pkgbld` use the same plugin-name predicate.
3. Installed plugins are discovered from `dependencies`, `devDependencies`,
   and `peerDependencies` in the target project's `package.json`.
4. A package found only in `node_modules` is not considered installed. The
   project manifest remains the source of truth.
5. Listing installed third-party plugins must not import or execute them.
6. An official registry entry enriches a discovered package; it does not create
   a second item for the same package.
7. Extensions that are not build plugins require official metadata, a direct
   package specifier during their first add, or an existing lock entry.
8. Official extension packages live in the internal cache. Build plugins and
   tools needed at build time live in the target project's dependencies.
9. The project lock stores canonical package names and exact versions. It does
   not store CLI aliases, export subpaths, version ranges, or package type.

Within this design, `Installed` means declared in the project manifest. The
package manager may still need to materialize that declaration in
`node_modules`; `create-pkgbld` handles that through its existing install flow.

## Package inventory

The target package-management screen combines three sources:

| Source | Can offer add? | Can detect installed? | Can offer remove? |
|---|---:|---:|---:|
| Official registry | Yes | Through its extension contract | Yes |
| Project lock | Reapply only | Through the exact recorded contract | Yes |
| Project dependency fields | No | By plugin package name | Yes |

Entries are merged by their underlying npm package name. A registry specifier
such as `pkgbld-plugin-example/extension` represents the package
`pkgbld-plugin-example`. A scoped specifier such as
`@author/pkgbld-plugin-example/extension` represents
`@author/pkgbld-plugin-example`.

Official metadata supplies the preferred display name, description, tags, and
specialized behavior. A lock entry establishes that an integration is managed.
A dependency declaration establishes that a build plugin is installed. These
sources describe different facts and merge into one item by package name.

For a registered build plugin, specialized removal runs first and generic
plugin removal then guarantees that the plugin package is absent from all three
dependency fields. Registry behavior may clean up additional owned files and
scripts, but it cannot leave a runtime plugin declaration behind.

## Scenario 1: installed unregistered build plugin

### Context

The target project contains a dependency that matches the plugin naming
contract, but the package is absent from both registries:

```json
{
    "devDependencies": {
        "@author/pkgbld-plugin-example": "^1.2.0"
    }
}
```

### Expected behavior

`create-pkgbld` displays `@author/pkgbld-plugin-example` as an installed build
plugin. No `.pkgbld-extensions.json` entry and no `/extension` export are
required.

The generic entry uses:

- **Identity:** the complete npm package name;
- **Display name:** the complete npm package name;
- **Description:** `Third-party PKG BLD plugin`;
- **Tags:** `plugin`, `pkgbld`, and `third-party`;
- **Status:** `Installed`;
- **Available operation:** remove.

The listing operation reads `package.json` only. It does not resolve or import
the plugin package.

### Removal

Removing the discovered plugin deletes its package name from every dependency
field in which it occurs:

- `dependencies`;
- `devDependencies`;
- `peerDependencies`.

Removing every declaration is necessary because `pkgbld` loads the plugin from
any of these fields. The normal dependency-install prompt or `--install`
behavior applies after the manifest change.

Removal does not delete unrelated configuration files because no extension
contract exists to establish ownership of those files.

### After removal

An unregistered third-party plugin disappears from the package-management list
after its removal is applied. `create-pkgbld` cannot offer it for installation
again because it has no source for a version, description, or installation
policy.

To make it available for subsequent installation, the user must add it again by
its full package specifier. An official registry entry can provide a short name
and installation metadata in a later `create-pkgbld` release.

### Registry enrichment

If a matching registry entry exists, the UI shows a single item using the
registry's metadata and extension behavior. It does not show both an official
entry and a separately discovered dependency.

This enables richer removal when a plugin owns additional files or scripts,
while keeping generic removal available to every correctly named plugin.

## Scenario 2: minimal project lock

### Format

The first lock format contains only a schema reference and a map from canonical
npm package names to exact versions:

```json
{
    "$schema": "https://unpkg.com/create-pkgbld/lock-schema-v1.json",
    "packages": {
        "create-pkgbld-extension-biome": "0.1.1",
        "@author/pkgbld-plugin-example": "1.2.0"
    }
}
```

The schema URI carries the format version, so the document has no separate
`lockfileVersion` property. Schema v1 is shipped as `lock-schema-v1.json` and
must remain immutable after publication. A future incompatible format gets a
new schema URI and filename.

The key is always the package root. Export subpaths such as `/extension` are
not stored. Package kind is derived from the name:

- `create-pkgbld-extension-*` and
  `@scope/create-pkgbld-extension-*` are extensions;
- `pkgbld-plugin-*` and `@scope/pkgbld-plugin-*` are build plugins.

Other package-name shapes are outside schema v1. Supporting arbitrary package
names would require storing an explicit kind and entry point in a later schema.

The value is the exact package version whose behavior was applied or adopted.
Version ranges and tags such as `latest` are not allowed. The official registry
or the originating add command may contain a range, but the lock records its
resolved result.

### Meaning of presence

A package in the lock means: **the project acknowledges this integration as
applied**. It is not proof that every expected artifact is still present, and
schema v1 does not attempt to record ownership or detect drift.

An extension is written after its setup changes commit successfully. A build
plugin installed manually may be adopted because declaring a correctly named
plugin is itself enough to activate it in PKG BLD. Adoption records the exact
installed version without pretending that a separate setup function ran.

Listing a manually installed plugin must not silently modify the lock. The UI
may show it as `Installed, unmanaged`; an explicit adopt action, or another
mutating management command that clearly reports adoption, writes the entry.

An extension package found manually in dependencies is not automatically
adopted. Installing extension code does not prove that its setup was applied.

### Lifecycle

- **Add:** write or update the entry only after project changes commit.
- **Adopt plugin:** write the exact resolvable plugin version.
- **Remove:** run available removal behavior, remove the plugin dependency when
  applicable, and delete the lock entry only after commit.
- **Fresh checkout:** use the exact lock version to restore missing extension
  code into the internal cache when an operation needs it.
- **Update:** compare the recorded exact version with the candidate version;
  schema v1 can identify an update but does not yet define safe artifact
  migration.

Writes sort package names lexicographically so the generated file produces
stable diffs. The lock is intended to be committed and must not be edited as a
catalog of available integrations.

### Deliberate omissions in schema v1

The minimal format does not record:

- source registry or CLI alias;
- requested version range;
- extension export subpath;
- prompts or options;
- dependencies, scripts, or files created by setup;
- hashes, ownership, or drift state;
- timestamps.

These omissions keep the first stage useful for rehydration and version
comparison without claiming to support safe automatic migrations. Artifact
ownership can be introduced by a later schema when update semantics are
designed.

## User-visible states

| Situation | State | Operations |
|---|---|---|
| Official package is not installed | `Available` | Add |
| Locked extension is not cached locally | `Applied` | Rehydrate, remove |
| Registered package is installed | `Installed, managed` | Remove |
| Unregistered plugin is declared in the project | `Installed, unmanaged` | Remove, adopt |
| Registry package cannot be resolved | `Unavailable` | None |
| Package name does not match the plugin pattern and has no registry entry | Hidden | None |

## Current implementation

`pkgbld` and `create-pkgbld` share the same scoped/unscoped plugin-name
predicate. `create-pkgbld` combines the official registry, project lock, and all
three dependency fields into one inventory. It reads and writes the versioned
lock, supports explicit adoption, restores locked extension code through the
shared cache, and provides generic removal for plugins without extension
behavior. `.pkgbld-extensions.json` is not read.

Direct addition of an unregistered third-party extension remains a future
scenario. An unregistered plugin becomes visible after it is declared in the
project manifest.

## Future scenarios

Add new scenarios as separate sections and state their interaction with the
core rules and package inventory. Likely follow-ups include:

- adding a third-party extension by full package specifier;
- an official plugin before and after installation;
- a package offering both standalone extension and build-plugin modes;
- safe version updates and cache invalidation;
- ownership conflicts between extensions;
- monorepo root and workspace-package discovery.

## Open questions

- Should a discovered plugin expose package metadata such as its npm
  description without executing code, or is the generic description enough?
- Should removal warn when the same package appears in more than one dependency
  field, or simply show all affected fields in the diff?
- Do organizations need a separate shareable catalog or policy mechanism after
  `.pkgbld-extensions.json` is removed?
