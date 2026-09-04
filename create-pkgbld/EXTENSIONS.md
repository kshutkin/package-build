# Extension Authoring Guide

`create-pkgbld` ships with a small extension system that lets a third-party
npm package add or remove a feature (linter, plugin, formatter, etc.) from a
user's project. This document is the contract.

## Overview

An extension is an ESM npm package that exports a manifest plus two
operations — `setup` and `remove` — and is referenced by name from a
**registry** JSON file. The registry is shipped with `create-pkgbld`
itself, and may be augmented per-project via `.pkgbld-extensions.json`.

```
┌──────────────┐      ┌────────────────────┐      ┌──────────────────┐
│   Registry   │─────▶│    Core Engine      │◀────▶│  Extension Pkg   │
│ (JSON file)  │      │ (create-pkgbld)     │      │ (npm package)    │
└──────────────┘      └────────────────────┘      └──────────────────┘
```

The engine builds a virtual file `Tree` for the project root, hands it to
each extension's `setup` (or `remove`) implementation, then prints the
collected diff and commits to disk in one shot.

---

## Registry format

A registry file is JSON shaped like this:

```json
{
  "$schema": "./extensions-schema.json",
  "extensions": [
    {
      "name": "biome",
      "package": "pkgbld-plugin-biome",
      "description": "Biome linter and formatter",
      "tags": ["linter", "formatter"]
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | Unique CLI handle (`create-pkgbld add <name>`). |
| `package` | yes | Module specifier or subpath import (`my-pkg/extension`). |
| `description` | yes | Short one-liner shown in `list` / TUI. |
| `tags` | no | Optional tags for grouping/filtering. |

The shape is validated by `extensions-schema.json` (draft-07). Editors that
respect `$schema` will autocomplete.

### Per-project registry

If a project root contains `.pkgbld-extensions.json` (same shape), its
entries are merged on top of the built-in registry. Local entries win on
name collision, so you can locally override a built-in or add extensions
that aren't yet published.

---

## Extension package contract

Each package referenced by `package` must export the following named
ESM exports:

```js
export const manifest = {
    name: 'biome',
    description: 'Biome linter and formatter',
    tags: ['linter', 'formatter'],
};

export const setup  = /* declarative obj OR async (tree, options) => void */;
export const remove = /* declarative obj OR async (tree, options) => void */;
export function detect(tree)  { /* boolean: is it already installed? */ }
export function prompts(tree) { /* optional: Option[] for interactive flow */ }
```

`manifest`, `setup`, and `remove` are required. `detect` is optional but
strongly recommended (without it, the CLI assumes "not installed").
`prompts` is optional and only used in interactive mode.

### Declarative `setup`

```js
export const setup = {
    dependencies:    { 'some-dep':       '^1.0.0' },
    devDependencies: { '@biomejs/biome': '^2.3.8' },
    scripts: {
        lint:       'biome check ./src',
        'lint:fix': 'biome check --fix ./src',
    },
    files: {
        // target -> source. Source may be a template path (relative to the
        // extension package root) or `inline:<literal content>`.
        'biome.json': './templates/biome.tpl.json',
        '.gitignore': 'inline:dist\nnode_modules\n',
    },
    packageJson: { type: 'module' }, // shallow merge into package.json
};
```

### Declarative `remove`

```js
export const remove = {
    dependencies:    ['some-dep'],
    devDependencies: ['@biomejs/biome'],
    scripts:         ['lint', 'lint:fix'],
    files:           ['biome.json'],
};
```

### Programmatic form

If declarative isn't expressive enough, both `setup` and `remove` may
instead be `async (tree, options) => void`:

```js
export async function setup(tree, options) {
    const pkg = tree.readJson('package.json') ?? {};
    pkg.scripts = { ...pkg.scripts, hello: `echo ${options.greeting}` };
    tree.updateJson('package.json', () => pkg);
    if (!tree.exists('hello.txt')) tree.write('hello.txt', 'hi\n');
}
```

`options` is the `OptionsValue` collected from the extension's `prompts()`
(empty `{}` if `prompts` is not exported).

### `detect(tree) -> boolean`

Used by `list` and the TUI to decide whether to show `[Installed]` or
`[Not installed]`. Typical implementation inspects `package.json`:

```js
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg?.devDependencies?.['@biomejs/biome']) || tree.exists('biome.json');
}
```

### `prompts(tree) -> Option[]`

Returns a list of `Option` objects (same `Option` type used by the rest of
`create-pkgbld`'s extension UI). Each option contributes one prompt before
setup runs; the answers are passed into `setup(tree, options)`.

---

## The Tree API

All file mutation in an extension goes through `Tree`. Reads are lazy
(loaded from disk on first access), writes are buffered, and the engine
calls `tree.commit()` once after all extensions have run.

| Method | Description |
|---|---|
| `read(path)` | Returns file content as string, or `null` if missing. |
| `write(path, content)` | Stages a CREATE or UPDATE. |
| `exists(path)` | True if the file exists (in tree or on disk). |
| `delete(path)` | Stages a DELETE (or cancels a pending CREATE). |
| `rename(oldPath, newPath)` | Move staged content. |
| `readJson(path)` | Parse JSON. Returns `null` if missing. |
| `updateJson(path, updater)` | Read, run updater(data), write back (formatted). |
| `addDependency(name, version, type?)` | type defaults to `'dependencies'`. |
| `removeDependency(name, type?)` | |
| `addScript(name, command)` | |
| `removeScript(name)` | |
| `resolveExtensionFile(rel)` | Resolve a path relative to the extension's package directory. |
| `listChanges()` | Returns `FileChange[]` of `{ path, type, content? }`. |
| `commit()` | Flush staged changes to disk. Engine handles this. |

Paths are project-root-relative. `resolveExtensionFile` is what you use
inside a programmatic `setup` to read template files bundled with your
extension package.

### Template files

The engine sets the extension base directory (the directory of the
resolved module file) automatically while `setup`/`remove` runs.
Declarative `files: { target: './tpl.json' }` resolves `./tpl.json`
relative to that base. Inside a programmatic setup, call
`tree.resolveExtensionFile('./templates/foo')` to obtain the absolute
path.

---

## Worked example: `pkgbld-plugin-biome`

```js
// pkgbld-plugin-biome/src/index.js
export const manifest = {
    name: 'biome',
    description: 'Biome linter and formatter',
    tags: ['linter', 'formatter'],
};

export const setup = {
    devDependencies: { '@biomejs/biome': '^2.3.8' },
    scripts: {
        lint:       'biome check ./src',
        'lint:fix': 'biome check --fix ./src',
    },
    files: { 'biome.json': './templates/biome.tpl.json' },
};

export const remove = {
    devDependencies: ['@biomejs/biome'],
    scripts: ['lint', 'lint:fix'],
    files: ['biome.json'],
};

export function detect(tree) {
    const pkg = tree.readJson('package.json');
    if (pkg?.devDependencies?.['@biomejs/biome'] || pkg?.dependencies?.['@biomejs/biome']) return true;
    return tree.exists('biome.json');
}
```

Registry entry:

```json
{ "name": "biome", "package": "pkgbld-plugin-biome", "description": "Biome linter and formatter", "tags": ["linter", "formatter"] }
```

That's the entire extension.

---

## Conflict detection

When multiple extensions run in the same flow (e.g. the interactive TUI),
the engine records all `write`/`delete`/`addDependency`/`addScript` calls
per extension and surfaces conflicts as warnings before commit:

- two different file contents written to the same path
- a path both written and deleted in the same run
- the same dependency added at different versions
- the same script name set to different commands

Conflicts are warnings, not errors — commit still proceeds (last writer
wins per the Tree's normal semantics). Extension authors should keep this
in mind and namespace files/scripts where it matters.

---

## Tips

- Keep `setup` idempotent. The engine doesn't enforce it but the diff
  display gets noisy if re-running the same extension produces churn.
- Use `detect` to gate things you can't safely re-add, and bail in `setup`
  if you must, but prefer letting Tree's UPDATE semantics handle re-runs.
- Don't rely on a specific working directory — always operate via the
  `tree` argument.
- For declarative `files`, store templates as `.tpl.json` (or another
  `.tpl.*` extension) so that the workspace's own linters/formatters
  don't try to parse them.
