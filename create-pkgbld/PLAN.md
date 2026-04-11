# Extension System Plan

> Transform `create-pkgbld` from a pkgbld-only scaffolding CLI into a general-purpose feature management system that can add/remove build features (linters, plugins, formatters, test runners, etc.) to any project.

## Table of Contents

- [Overview](#overview)
- [Terminology](#terminology)
- [Extension Registry (Discovery)](#extension-registry-discovery)
- [Extension Format](#extension-format)
- [Virtual File Tree](#virtual-file-tree)
- [CLI Interface](#cli-interface)
- [Refactoring Current Code](#refactoring-current-code)
- [Implementation Phases](#implementation-phases)

---

## Overview

The system consists of three layers:

1. **Extension Registry** — a JSON file describing available extensions and pointing to the packages that implement them.
2. **Extension Packages** — npm packages that export a hybrid declarative/programmatic contract (`setup`, `remove`, `detect`, and optional `prompts`).
3. **Core Engine** — lives in `create-pkgbld`, loads the registry, resolves extensions, provides a virtual file tree, orchestrates setup/remove, and commits changes to disk.

```
┌──────────────┐      ┌────────────────────┐      ┌──────────────────┐
│   Registry   │─────▶│    Core Engine      │◀────▶│  Extension Pkg   │
│  (JSON file) │      │  (create-pkgbld)    │      │  (npm package)   │
└──────────────┘      │                     │      └──────────────────┘
                      │  - load registry    │      ┌──────────────────┐
                      │  - resolve packages │◀────▶│  Extension Pkg   │
                      │  - build tree       │      │  (npm package)   │
                      │  - run extensions   │      └──────────────────┘
                      │  - show diff        │
                      │  - commit to disk   │
                      └────────────────────┘
```

---

## Terminology

| Term | Meaning |
|---|---|
| **Extension** | A unit of functionality that can be added to or removed from a project (e.g., "biome linter", "SWC plugin"). |
| **Registry** | A JSON file listing available extensions and the packages that implement them. |
| **Tree** | A virtual file system that extensions read from and write to. Changes are collected and committed at the end. |
| **Setup** | The procedure to add an extension to a project. |
| **Remove** | The procedure to remove an extension from a project. |
| **Detect** | A check to determine whether an extension is already installed. |

---

## Extension Registry (Discovery)

A JSON file that ships with `create-pkgbld` and can be extended locally.

### Built-in registry

Located at `create-pkgbld/extensions.json` (shipped with the package):

```json
{
  "$schema": "./extensions-schema.json",
  "extensions": [
    {
      "name": "biome",
      "package": "@pkgbld/ext-biome",
      "description": "Biome linter and formatter",
      "tags": ["linter", "formatter"]
    },
    {
      "name": "pkgbld-swc",
      "package": "@pkgbld/ext-swc",
      "description": "SWC TypeScript stripping via pkgbld",
      "tags": ["plugin", "typescript", "pkgbld"]
    },
    {
      "name": "pkgbld-dts-buddy",
      "package": "@pkgbld/ext-dts-buddy",
      "description": "Generate d.ts files using dts-buddy",
      "tags": ["plugin", "types", "pkgbld"]
    }
  ]
}
```

### Local project override

A project can place a `.pkgbld-extensions.json` in its root to add private or custom extensions. The core engine merges both registries (local entries override built-in entries with the same `name`).

```json
{
  "extensions": [
    {
      "name": "my-company-linter",
      "package": "@my-company/ext-linter",
      "description": "Internal linting preset"
    }
  ]
}
```

### Registry entry schema

```
ExtensionEntry {
  name: string            — unique identifier, used in CLI commands
  package: string         — npm package specifier (resolved via import/require)
  description: string     — human-readable summary
  tags?: string[]         — optional tags for filtering / grouping in TUI
}
```

### Resolution order

1. Load built-in `extensions.json` from the `create-pkgbld` package directory.
2. Look for `.pkgbld-extensions.json` in the target project root.
3. Merge: local entries win on `name` collision.
4. For each entry, dynamically `import()` the `package` specifier. The package must be installed (in the project or globally) or resolvable from `create-pkgbld`'s own `node_modules`.

---

## Extension Format

Each extension is an npm package that exports a specific contract. The format is **hybrid**: simple cases are purely declarative (plain objects), complex cases use programmatic functions that receive a virtual tree.

### Exports contract

```js
// Required
export const manifest = { ... };

// At least one of setup / remove should be provided
export const setup = { ... } | async function(tree, options) { ... };
export const remove = { ... } | async function(tree, options) { ... };

// Optional
export function detect(tree) { ... }
export function prompts(tree) { ... }
```

### `manifest` (required)

Static metadata about the extension. Must be an object.

```js
export const manifest = {
  name: "biome",
  description: "Biome linter and formatter",
  tags: ["linter", "formatter"],
};
```

### `setup` — declarative form

A plain object describing what to add. The core engine interprets it.

```js
export const setup = {
  // Merged into package.json dependencies
  dependencies: {},

  // Merged into package.json devDependencies
  devDependencies: {
    "@biomejs/biome": "^1.9.0",
  },

  // Merged into package.json scripts (keys that already exist are overwritten)
  scripts: {
    "lint": "biome check ./src",
    "lint:fix": "biome check --fix ./src",
  },

  // Files to create. Value is a path to a template file relative to the
  // extension package root, or an inline string prefixed with "inline:"
  files: {
    "biome.json": "./templates/biome.json",
  },

  // Merged into package.json top-level fields (shallow merge per key)
  packageJson: {
    type: "module",
  },
};
```

### `setup` — programmatic form

An async function that receives the virtual tree and an options object (collected from `prompts`, if provided).

```js
export async function setup(tree, options) {
  // Use tree helpers for common operations
  tree.updateJson("package.json", (pkg) => {
    pkg.devDependencies ??= {};
    pkg.devDependencies["@biomejs/biome"] = "^1.9.0";
    pkg.scripts ??= {};
    pkg.scripts.lint = "biome check ./src";
    return pkg;
  });

  // Write a file from a template
  const template = tree.read(
    tree.resolveExtensionFile("./templates/biome.json")
  );
  tree.write("biome.json", template);
}
```

### `remove` — declarative form

A plain object describing what to remove.

```js
export const remove = {
  // Package names to remove from devDependencies
  devDependencies: ["@biomejs/biome"],

  // Script names to remove
  scripts: ["lint", "lint:fix"],

  // Files to delete
  files: ["biome.json"],
};
```

### `remove` — programmatic form

```js
export async function remove(tree) {
  tree.updateJson("package.json", (pkg) => {
    delete pkg.devDependencies?.["@biomejs/biome"];
    delete pkg.scripts?.lint;
    delete pkg.scripts?.["lint:fix"];
    return pkg;
  });

  tree.delete("biome.json");
}
```

### `detect(tree)` (optional)

Returns a boolean indicating whether this extension is currently active in the project. Used to show status in the TUI and to guard against double-setup.

```js
export function detect(tree) {
  const pkg = tree.readJson("package.json");
  return pkg?.devDependencies?.["@biomejs/biome"] != null;
}
```

If not provided, the engine defaults to `false` (always shows as "not installed").

### `prompts(tree)` (optional)

Returns an array of `Option` objects (using the existing `Option` type from `create-pkgbld/src/types.js`) that are presented to the user before setup/remove. The collected values are passed as the `options` argument to the programmatic `setup`/`remove`.

```js
export function prompts(tree) {
  return [
    {
      title: "Lint target directory",
      field: "lintDir",
      initialValue: "./src",
    },
  ];
}
```

### Type summary

```
Extension {
  manifest: {
    name: string
    description: string
    tags?: string[]
  }

  setup?:
    | SetupDeclarative
    | (tree: Tree, options: OptionsValue) => Promise<void>

  remove?:
    | RemoveDeclarative
    | (tree: Tree, options: OptionsValue) => Promise<void>

  detect?: (tree: Tree) => boolean

  prompts?: (tree: Tree) => Option[]
}

SetupDeclarative {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
  files?: Record<string, string>       // target path → template path or "inline:..."
  packageJson?: Record<string, unknown> // shallow merge into package.json
}

RemoveDeclarative {
  dependencies?: string[]
  devDependencies?: string[]
  scripts?: string[]
  files?: string[]
}
```

---

## Virtual File Tree

A lightweight virtual file system that sits between extensions and the real disk. Extensions read/write to the tree; the engine commits all changes at the end.

### Interface

```
Tree {
  // Core operations
  read(path: string): string | null
  write(path: string, content: string): void
  exists(path: string): boolean
  delete(path: string): void
  rename(oldPath: string, newPath: string): void

  // JSON helpers
  readJson(path: string): any | null
  updateJson(path: string, updater: (data: any) => any): void

  // Package.json helpers
  addDependency(name: string, version: string, type?: 'dependencies' | 'devDependencies'): void
  removeDependency(name: string, type?: 'dependencies' | 'devDependencies'): void
  addScript(name: string, command: string): void
  removeScript(name: string): void

  // Extension-relative path resolution
  resolveExtensionFile(relativePath: string): string

  // Introspection
  listChanges(): FileChange[]
}

FileChange {
  path: string
  type: 'CREATE' | 'UPDATE' | 'DELETE'
  content?: string
}
```

### Implementation notes

- Backed by a `Map<string, { content: string | null, action: 'CREATE' | 'UPDATE' | 'DELETE' }>`.
- On first `read()` of a path, lazily loads from disk and caches.
- `write()` to a path that was read marks it as `UPDATE`; to a new path marks it as `CREATE`.
- `delete()` marks the entry as `DELETE`.
- `listChanges()` returns all entries with a non-null action.
- `readJson` / `updateJson` are convenience wrappers around `read` / `write` with `JSON.parse` / `JSON.stringify`.
- `resolveExtensionFile()` resolves a path relative to the extension package's root directory (determined at load time via `import.meta.resolve` or `require.resolve`).

### Declarative engine

When `setup` or `remove` is a plain object, the core engine translates it into tree operations:

**Setup (object):**
1. For each `dependencies` / `devDependencies` entry → `tree.addDependency(name, version, type)`
2. For each `scripts` entry → `tree.addScript(name, command)`
3. For each `files` entry → resolve template via `tree.resolveExtensionFile()`, read it, `tree.write(targetPath, content)`
4. For each `packageJson` entry → `tree.updateJson("package.json", ...)`

**Remove (object):**
1. For each `dependencies` / `devDependencies` entry → `tree.removeDependency(name, type)`
2. For each `scripts` entry → `tree.removeScript(name)`
3. For each `files` entry → `tree.delete(path)`

---

## CLI Interface

### Extended commands

The existing `npm init pkgbld` / `create-pkgbld` flow is preserved. New subcommands are added:

```
create-pkgbld                        # existing scaffolding flow (unchanged)
create-pkgbld add <extension>        # add a feature
create-pkgbld remove <extension>     # remove a feature
create-pkgbld list                   # list available extensions and their status
```

### Flags

```
--quiet, -q          Suppress output
--yes, -y            Skip interactive prompts, use defaults
--registry <path>    Path to a custom registry JSON
--dry-run            Show what would change without writing to disk
```

### TUI integration

The existing `prompts`-based TUI is extended:

1. `create-pkgbld` (no subcommand) shows the current top-level menu (General, Git, pkgbld) **plus** a new "Extensions" group.
2. The Extensions group lists all registry entries, with a status indicator: `[Installed]` / `[Not installed]`.
3. Selecting an extension toggles it (setup or remove) and, if the extension provides `prompts()`, drills into its configuration.
4. On "Done", all tree changes (from built-in options AND extensions) are committed together.

### Non-interactive mode

```
create-pkgbld add biome --yes
create-pkgbld remove biome --yes
```

Loads the extension, skips prompts (uses defaults or values from existing config), applies changes, prints summary.

---

## Refactoring Current Code

### What stays

- The `Option` / `OptionsValue` type system — it's already a good fit for extension prompts.
- The prompts-based TUI loop — extended but not replaced.
- `readPackage()` / `writePackage()` — wrapped by the tree but logic reused.
- `pad16plus`, `kebabize`, `removeEmpty`, formatting utilities.

### What changes

| Current | Becomes |
|---|---|
| `getBasicOptions()` | Built-in "general" extension (or stays as core, not an extension) |
| `getGitOptions()` | Built-in "git" extension (or stays as core) |
| `getPkgbldOptions()` | Separate built-in extension: `@pkgbld/ext-pkgbld` |
| `updatePackage()` / `writePackage()` | Tree-based: extensions write to tree, engine commits at end |
| Direct `fs.writeFile` calls | Replaced by `tree.write()` → engine commits all changes |
| Hardcoded `execute()` flow | Split into: registry loading → extension resolution → TUI → tree commit |

### New source files

```
create-pkgbld/
├── src/
│   ├── index.js              # CLI entry point, argument parsing, main flow
│   ├── types.js              # Extended type definitions
│   ├── tree.js               # Virtual file tree implementation
│   ├── registry.js           # Load and merge extension registries
│   ├── engine.js             # Declarative-to-tree interpreter, extension runner
│   ├── tui.js                # Interactive prompts (extracted from current index.js)
│   ├── get-git-root.js       # (unchanged)
│   └── utils.js              # pad16plus, kebabize, removeEmpty, etc.
├── extensions.json            # Built-in extension registry
├── extensions-schema.json     # JSON Schema for registry files
├── index.js                   # bin entry point (unchanged)
└── package.json
```

---

## Implementation Phases

### Phase 1: Core infrastructure

**Goal:** Tree, registry loader, and engine — no TUI changes yet.

1. **`tree.js`** — Implement the `Tree` class with core operations (`read`, `write`, `exists`, `delete`, `rename`), JSON helpers (`readJson`, `updateJson`), package.json helpers (`addDependency`, `removeDependency`, `addScript`, `removeScript`), and `listChanges()`.
2. **`registry.js`** — Implement `loadRegistry(builtinPath, projectRoot)` that reads the built-in JSON and optionally merges `.pkgbld-extensions.json`.
3. **`engine.js`** — Implement `runSetup(extension, tree, options)` and `runRemove(extension, tree, options)` that handle both declarative objects and programmatic functions. Implement `detectExtension(extension, tree)`.
4. **`extensions.json`** — Create initial registry with 1–2 entries (e.g., biome, pkgbld-swc).
5. **Unit tests** for tree operations, registry merging, and declarative engine.

**Deliverable:** `create-pkgbld add <name> --yes` and `create-pkgbld remove <name> --yes` work in non-interactive mode.

### Phase 2: CLI subcommands

**Goal:** Wire up `add`, `remove`, `list` subcommands.

1. **Extend argument parsing** in `index.js` to recognize subcommands.
2. **`create-pkgbld list`** — Load registry, for each entry call `detect()`, print table with status.
3. **`create-pkgbld add <name>`** — Load extension, call `prompts()` if present (or skip with `--yes`), run `setup()`, show diff, commit.
4. **`create-pkgbld remove <name>`** — Same flow but with `remove()`.
5. **`--dry-run`** — Print `listChanges()` as a diff instead of committing.

**Deliverable:** Full non-interactive CLI for managing extensions.

### Phase 3: TUI integration

**Goal:** Integrate extensions into the interactive prompts flow.

1. **Extract** current TUI code into `tui.js`.
2. **Add "Extensions" section** to the top-level menu showing all registry entries with `[Installed]` / `[Not installed]` status.
3. **Drill-down:** Selecting an extension shows its `prompts()` options or a simple "Install / Remove" toggle.
4. **Unified commit:** All changes (basic options + git + pkgbld + extensions) go through the tree and are committed together at the end.

**Deliverable:** `create-pkgbld` (no args) shows extensions in the interactive menu.

### Phase 4: First-party extensions

**Goal:** Publish real extension packages.

1. **`@pkgbld/ext-biome`** — Biome linter/formatter setup.
2. **`@pkgbld/ext-swc`** — Wraps `pkgbld-plugin-swc` setup (adds dep + config).
3. **`@pkgbld/ext-dts-buddy`** — Wraps `pkgbld-plugin-dts-buddy` setup.
4. **Refactor** `getPkgbldOptions()` into an extension (or keep as core — TBD based on how it feels).
5. Update `extensions.json` with all entries.

**Deliverable:** Usable set of extensions covering current pkgbld ecosystem.

### Phase 5: Polish

1. **`extensions-schema.json`** — JSON Schema for registry files, enabling editor auto-complete.
2. **Diff display** — Pretty-print pending changes before commit (colored, file-by-file).
3. **Conflict detection** — Warn if two extensions modify the same file/field.
4. **Post-commit hooks** — Optional `pnpm install` / `npm install` after dependency changes.
5. **Documentation** — Extension authoring guide, README updates.

---

## Open Questions

These don't need answers now but should be decided during implementation:

1. **Should `getBasicOptions` and `getGitOptions` become extensions?** They work differently from feature extensions (they always apply). Keeping them as core avoids overcomplicating the model. On the other hand, making them extensions proves the system is general enough.

2. **Template engine for files?** The current plan uses static template files. A simple token replacement (e.g., `{{projectName}}`) might be useful. Alternatively, programmatic setup handles dynamic content.

3. **Extension dependency ordering?** If extension B depends on extension A, should the registry express that? For now, extensions are independent. Add ordering only if needed.

4. **Remote registry fetching?** Deferred. For now, the registry is local (bundled + project override). Fetching from npm or a URL can be added later as a natural extension of the registry loader.
