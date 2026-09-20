# Create PKG BLD Package Management Design

**Status:** Guarded update stage implemented
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
- Make managed package updates reviewable without expanding the project lock
  into an artifact-ownership database.

## Non-goals

- Searching npm for arbitrary PKG BLD plugins.
- Making an uninstalled third-party package available again without registry
  metadata.
- Defining the runtime plugin API. That contract belongs to `pkgbld`.
- Treating every installed development tool as a PKG BLD package.
- Providing a general-purpose three-way merge for arbitrary project files.

## Terminology

### Build plugin

An npm package loaded by `pkgbld` during a build. Its package name must match
one of these patterns:

```text
pkgbld-plugin-<name>
@<scope>/pkgbld-plugin-<name>
```

The package exports the PKG BLD runtime plugin API and must declare `pkgbld` in
`peerDependencies`. The peer range is both a compatibility constraint and the
marker that the package follows the modern plugin contract. Naming identifies
a plugin candidate; an additional `create-pkgbld` configuration or
`/extension` export is not required for the plugin to work.

### Extension

An npm package containing setup and removal behavior for `create-pkgbld`.
Extensions may add dependencies, scripts, configuration files, or package
metadata. They are discovered through registry metadata because their purpose
cannot be inferred from their package name alone.

Extensions do not declare `pkgbld` as a peer dependency merely to participate
in this system. They configure a package and may be useful when that package
does not use PKG BLD. Extension compatibility may get a separate contract if
it becomes necessary later.

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
3. Every modern build plugin declares a compatible `pkgbld` range in
   `peerDependencies`. A plugin without that declaration is treated as legacy.
4. Installed plugins are discovered from `dependencies`, `devDependencies`,
   and `peerDependencies` in the target project's `package.json`.
5. A package found only in `node_modules` is not considered installed. The
   project manifest remains the source of truth.
6. Listing installed third-party plugins may resolve and read package metadata,
   but must not import or execute plugin code.
7. An official registry entry enriches a discovered package; it does not create
   a second item for the same package.
8. Extensions that are not build plugins require official metadata, a direct
   package specifier during their first add, or an existing lock entry.
9. Official extension packages live in the internal cache. Build plugins and
   tools needed at build time live in the target project's dependencies.
10. The project lock stores canonical package names and exact versions. It does
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

Plugin-name discovery produces candidates rather than automatically eligible
inventory entries. For each declared plugin, `create-pkgbld` resolves its
package metadata without importing the package and verifies that
`peerDependencies.pkgbld` is present. A missing peer declaration identifies a
legacy plugin. The plugin is omitted from the manageable inventory and a
warning tells the user to upgrade it first.

If project dependencies have not been materialized and the plugin manifest
cannot be resolved, `create-pkgbld` cannot establish eligibility. It omits the
candidate and tells the user to install project dependencies before trying
again. This check stays offline and does not search npm.

For add and update operations, an eligible plugin's peer range must also accept
the target project's `pkgbld` version. An incompatible range blocks the
operation with the versions and required range in the diagnostic. Extensions
whose package name is not a build-plugin name do not participate in this peer
check.

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

`create-pkgbld` resolves the installed package manifest and checks its
`peerDependencies.pkgbld` declaration. If the declaration exists, it displays
`@author/pkgbld-plugin-example` as an installed build plugin. No
`.pkgbld-extensions.json` entry and no `/extension` export are required.

The generic entry uses:

- **Identity:** the complete npm package name;
- **Display name:** the complete npm package name;
- **Description:** `Third-party PKG BLD plugin`;
- **Tags:** `plugin`, `pkgbld`, and `third-party`;
- **Status:** `Installed`;
- **Available operation:** remove.

The listing operation reads the project manifest and the resolved plugin
manifest. It does not import or execute the plugin package.

If the peer declaration is absent, the package is excluded from the inventory
and the CLI reports an actionable warning, for example:

```text
Ignoring @author/pkgbld-plugin-example: the installed package does not declare
pkgbld in peerDependencies. Upgrade the plugin before managing it with
create-pkgbld.
```

Exclusion affects `create-pkgbld` management only. `pkgbld` may still discover
the dependency by name at runtime; this warning does not claim that legacy code
is safe or compatible.

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
- **Update:** compare the recorded exact version with an exact candidate and
  apply the guarded migration described in Scenario 3.

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
comparison. Scenario 3 derives update ownership from the exact old and new
extension contracts instead of persisting artifact metadata in schema v1.

## Scenario 3: guarded package updates

### Scope and baseline

The first update implementation supports managed packages that have both a
project-lock entry and official registry metadata. An unmanaged plugin must be
adopted before it can be updated. The bundled registry version range defines
the allowed update channel, and the selected candidate must resolve to an exact
version newer than the locked version.

Ordinary listing remains offline. Registry lookup, package download, and
candidate selection start only after an explicit update action. Prereleases,
downgrades, arbitrary npm tags, unregistered packages, and bulk updates are
deferred until the single-package flow is established.

This branch establishes the first modern extension-contract baseline. A locked
legacy package whose old exact version does not expose that contract cannot be
updated automatically. The user must upgrade it manually and adopt the
resolved version before later updates can use this scenario.

No production extension currently asks configuration questions. The update
contract nevertheless permits target-version prompts in the future. Schema v1
does not retain previous answers, so migration code must infer prior choices
from the project or ask again.

### Resource ownership

An extension owns only the resource leaves declared or explicitly handled by
its contract. Containers are shared:

- a script resource is one key such as `scripts.lint`, not the `scripts`
  object;
- a dependency resource is one package name in one dependency field, not the
  dependency object;
- a package metadata resource is one property path;
- a file resource is one project-relative path.

Ownership gives an extension authority to propose a change. It does not permit
silently overwriting a value that differs from the extension's known previous
value. Extensions should use distinct resources. Existing cross-package claim
analysis remains a backstop when two operations nevertheless propose different
values for the same resource.

The current official integrations satisfy this convention: Biome owns its
dependency, `scripts.lint`, `scripts["lint:fix"]`, and `biome.json`; standalone
DTS Buddy owns its dependencies and `scripts["build:types"]`; the two build
plugin extensions currently own only their respective plugin dependencies.

### Version-isolated extension cache

Updates may need the old and target contracts at the same time. The shared
extension cache therefore stores exact versions independently rather than
installing every version into one mutable `node_modules` tree. Conceptually:

```text
<cache>/extensions/<encoded-package-name>/<exact-version>/
```

The locked exact version supplies the previous contract. The exact candidate
supplies the desired declarative state and any explicit update code. Cache
population may occur during preparation or dry-run, but it must not modify the
target project.

### Declarative resource reconciliation

When both versions expose declarative setup, `create-pkgbld` derives resource
transitions from the old declaration, current project value, and new
declaration. This is a guarded resource comparison, not a general file merge
and not additional project-lock metadata.

For each resource, including absence as a value:

| Old declaration | Current project | New declaration | Result |
|---|---|---|---|
| `A` | `A` | `B` | Replace with `B` |
| `A` | `B` | `B` | No change; already updated |
| `A` | custom | `B` | Report a migration conflict and propose `B` |
| absent | absent | `B` | Add `B` |
| absent | custom | `B` | Report a migration conflict and propose `B` |
| `A` | `A` | absent | Remove the resource |
| `A` | custom | absent | Report a migration conflict and propose removal |
| `A` | custom | `A` | Preserve the customization |

The final rule also covers a missing resource when the desired declaration did
not change. Update does not double as repair. A separate restore or reconcile
operation may restore missing unchanged resources later.

Scripts and dependency specifiers use exact string comparison. Package JSON
values use structural comparison. JSON configuration files should use parsed
structural comparison so formatting-only edits do not create conflicts;
arbitrary files use exact content comparison.

This mechanism is sufficient for simple additions, replacements, and removals
in the current declarative extensions. It also prevents one extension from
replacing user customization merely because the extension owns the resource
key or file path.

### Explicit update behavior

The target package may export an `update` function when a resource needs
semantic migration. Target-version code owns the migration and must either
support the exact source version or report that the transition is unsupported.
It migrates directly from the locked version to the target version; the engine
does not execute each intermediate release.

An illustrative contract is:

```js
export async function update(tree, context, options) {
    const {
        fromVersion,
        toVersion,
        reconcileDeclarative,
        reportConflict,
    } = context;

    reconcileDeclarative({ exclude: ['file:biome.json'] });

    const config = tree.readJson('biome.json');
    if (canMigrate(config, fromVersion, toVersion)) {
        tree.updateJson('biome.json', value => migrate(value, toVersion));
    } else {
        reportConflict({
            resource: 'file:biome.json',
            current: config,
            proposed: nextConfig,
            message: 'Biome configuration cannot be migrated automatically',
        });
        tree.write('biome.json', `${JSON.stringify(nextConfig, null, 2)}\n`);
    }
}
```

The exact helper names are not yet public API. The required behavior is:

- the hook can delegate ordinary resources to declarative reconciliation;
- it can exclude resources that require domain-specific migration;
- it can record a migration conflict while staging a proposed result for
  review;
- throwing rolls back the package operation's staged changes;
- if no hook exists and declarative reconciliation is not possible, the update
  is unsupported rather than falling back to remove followed by setup.

### Conflict review

A migration conflict records the owning package, resource, expected previous
value, actual current value, and proposed result. The CLI stages the proposal
so the user can inspect the normal project diff, then requires explicit
approval before commit.

Interactive mode may ask once whether to accept all displayed migration
conflicts. Non-interactive execution requires `--accept-conflicts`; `--yes`
answers extension questions with defaults but does not authorize overwriting
modified resources. Rejecting conflicts leaves the project unchanged.

Cross-package conflicts and migration conflicts remain distinct. The former
mean two selected package operations disagree. The latter mean the project has
drifted from the updating package's known previous value.

### Build plugin updates

Core package management updates a build plugin's own dependency. The extension
hook handles only additional scripts, files, dependencies, or configuration.
The first implementation writes the exact target plugin version to
`devDependencies`, runs the project package manager, and verifies that exact
version from the project before advancing the PKG BLD lock.

Project changes and package-manager installation cannot be one filesystem
transaction. A dependency-changing update therefore uses a recoverable
two-phase flow:

1. stage and review dependency and extension changes;
2. commit project changes while retaining the old PKG BLD lock entry;
3. run the package manager and verify the resolved plugin version;
4. write the new exact version to the PKG BLD lock.

If installation fails, the command exits unsuccessfully and the old lock entry
remains. A retry is safe: resources already equal to the proposed values are
no-ops under the reconciliation rules.

An extension-only update does not install its implementation into the target
project. Its exact target code remains in the shared cache. Dependencies that
the extension adds to the target project continue to use the normal install
flow.

Modern build plugins must declare a compatible `pkgbld` peer dependency.
`create-pkgbld` validates that peer range before staging an update instead of
relying solely on package-manager enforcement. A plugin version without the
peer declaration is a legacy baseline and is not an update candidate.

### Operation shape

The package-operation interface remains target-based:

```js
const operation = await packages.prepare({
    package: 'biome',
    target: 'updated',
});

// operation.effect === 'update'
// operation.versionChange === { from: '0.1.0', to: '0.2.0' }

await operation.stage(project, answers);
```

The initial command surface is:

```text
create-pkgbld update <package>
create-pkgbld update <package> --dry-run
create-pkgbld update <package> --accept-conflicts
```

Candidate resolution and extension validation occur before project staging.
The lock change is prepared only after migration succeeds and is committed
last, subject to the two-phase plugin flow above.

## User-visible states

| Situation | State | Operations |
|---|---|---|
| Official package is not installed | `Available` | Add |
| Locked extension is not cached locally | `Applied` | Rehydrate, remove |
| Registered package is installed | `Installed, managed` | Remove |
| Unregistered plugin is declared in the project | `Installed, unmanaged` | Remove, adopt |
| Declared plugin has no `pkgbld` peer dependency | Excluded | Warn and suggest upgrade |
| Declared plugin metadata cannot be resolved | Excluded | Warn and suggest installing dependencies |
| Registry package cannot be resolved | `Unavailable` | None |
| Package name does not match the plugin pattern and has no registry entry | Hidden | None |

## Current implementation

`pkgbld` and `create-pkgbld` share the same scoped/unscoped plugin-name
predicate. `create-pkgbld` combines the official registry, project lock, and all
three dependency fields into one inventory. It reads and writes the versioned
lock, supports explicit adoption, restores locked extension code through the
shared cache, and provides generic removal for plugins without extension
behavior. `.pkgbld-extensions.json` is not read.

Callers request a package target of `managed`, `updated`, or `absent`. Package
operations derive setup, restoration, adoption, update, or removal from that
target and the inventory state. Extension acquisition, lifecycle execution,
and the matching project-lock mutation stay together behind that interface;
interactive and subcommand callers retain prompting, rendering, commit, and
installation.

Package operations stage sequentially through `ProjectChanges`. Each operation
sees the accumulated result of earlier operations. `ProjectChanges` retains
semantic claims for conflict review separately from the final filesystem diff,
rolls back a failed operation's staged changes, and commits the project lock
last. Conflicts remain warnings and the last staged value remains the pending
result.

Scenario 3 is implemented for explicit single-package updates. The cache keeps
exact extension versions in separate slots, declarative contracts use guarded
resource reconciliation, target packages may export explicit update behavior,
and migration conflicts require interactive approval or
`--accept-conflicts`. Build plugin updates use the two-phase install and lock
flow and inventory discovery enforces the plugin peer-dependency gate.

Direct addition of an unregistered third-party extension remains a future
scenario. An unregistered plugin becomes visible after it is declared in the
project manifest.

## Future scenarios

Add new scenarios as separate sections and state their interaction with the
core rules and package inventory. Likely follow-ups include:

- adding a third-party extension by full package specifier;
- an official plugin before and after installation;
- a package offering both standalone extension and build-plugin modes;
- ownership conflicts between extensions;
- monorepo root and workspace-package discovery.

## Open questions

- Should a discovered plugin expose package metadata such as its npm
  description without executing code, or is the generic description enough?
- Should removal warn when the same package appears in more than one dependency
  field, or simply show all affected fields in the diff?
- Do organizations need a separate shareable catalog or policy mechanism after
  `.pkgbld-extensions.json` is removed?
