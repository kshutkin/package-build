# create-pkgbld Extension System — Implementation Spec

Source of truth: `create-pkgbld/PLAN.md` (original plan as written, NOT `PLAN-REVIEW.md`).
`PLAN-REVIEW.md` and `RECOMMENDATIONS.md` are advisory only.

## Locked decisions

- Scope: all phases (1–5), including first-party extension packages.
- Semantics: follow original `PLAN.md` as written.
- Core flows: general/git/pkgbld option groups remain CORE (not extensions).
- Reuse existing `pkgbld-plugin-*` packages for swc & dts-buddy extensions.
- Biome: new monorepo package `pkgbld-plugin-biome` with manifest/setup/remove + `biome.json` template.
- Extension contract attaches via a **separate subpath export** e.g. `pkgbld-plugin-swc/extension`
  exporting `manifest`/`setup`/`remove`. Registry `package` field points to that subpath.
  The existing main rollup-plugin entry is not polluted.

## Key facts about the codebase

- Node test runner (`node:test`). Tests run via `pnpm -r test`.
- `pkgbld` auto-loads any dep/devDep named `pkgbld-plugin-*` (see `pkgbld/src/load-plugins.js`).
  → swc/dts-buddy extension setup = add devDependency. Remove = delete it.
- `create-pkgbld` is ESM, `type: module`, bin `./index.js`, main `./src/index.js`, node ≥ 20.
- `create-pkgbld/src/index.js`: current single-file flow (`getBasicOptions`/`getGitOptions`/`getPkgbldOptions`, prompts TUI, `updatePackage`/`writePackage`).
- `Option`/`OptionsValue` types in `create-pkgbld/src/types.js` — reused for extension `prompts()`.
- Workspace: pnpm, biome 2.3.8, catalog deps.

## Target file layout (`create-pkgbld/`)

| File | Purpose |
|---|---|
| `src/index.js` | CLI entry, arg parsing, main flow |
| `src/types.js` | Extended types |
| `src/tree.js` | Virtual file tree |
| `src/registry.js` | Load + merge registries |
| `src/engine.js` | Declarative→tree interpreter, `runSetup`/`runRemove`, `detectExtension` |
| `src/tui.js` | Extracted interactive prompts |
| `src/subcommands.js` | `runList`/`runAdd`/`runRemoveCmd` |
| `src/diff.js` | `renderChanges` (CREATE green / UPDATE yellow / DELETE red, package.json key-level diff) |
| `src/conflicts.js` | `detectConflicts` + `recordOps` |
| `src/install.js` | `detectPackageManager` + `changesAffectDependencies` + `runInstall` via spawn |
| `extensions.json` | Built-in registry |
| `extensions-schema.json` | JSON schema (draft-07) |
| `EXTENSIONS.md` | Extension authoring guide |

## CLI commands

```
create-pkgbld                        # existing flow + Extensions menu
create-pkgbld add <extension>
create-pkgbld remove <extension>
create-pkgbld list
```

Flags: `--quiet`/`-q`, `--yes`/`-y`, `--registry <path>`, `--dry-run`, `--install`

## Tree interface

Methods: `read`/`write`/`exists`/`delete`/`rename`; `readJson`/`updateJson`;
`addDependency`/`removeDependency`/`addScript`/`removeScript`;
`resolveExtensionFile`; `listChanges()`.

Backed by `Map<path, {content, action: CREATE|UPDATE|DELETE}>`. Lazy disk load on read.

Path-traversal guard: `_key`/`_abs` throw `"Path escapes project root"` for `..` paths.

## Extension contract

```js
export const manifest = { name, description, tags? };
export async function setup(tree, options) { /* or declarative obj */ }
export async function remove(tree, options) { /* or declarative obj */ }
export function detect(tree) { return bool; }   // optional, default false
export function prompts(tree) { return Option[]; } // optional
```

Declarative `setup`: `{ dependencies, devDependencies, scripts, files(target→template path or "inline:..."), packageJson(shallow merge) }`.
Declarative `remove`: `{ dependencies[], devDependencies[], scripts[], files[] }`.

## Phase completion status

### Phase 1 — Core infrastructure ✅
- `tree.js`, `registry.js`, `engine.js`, `extensions.json` (skeleton entries)
- Unit tests: 22 pass, biome clean
- `Tree.setExtensionBase(dir)` chosen for extension base; engine wraps in try/finally

### Phase 2 — CLI subcommands ✅
- `subcommands.js`: `runList`/`runAdd`/`runRemoveCmd`
- `index.js` dispatches on `argv[2]` in `(list|add|remove)` else original flow
- `--registry` replaces built-in path; `collectExtensionOptions` flat only
- 27 tests pass

### Phase 3 — TUI integration ✅
- `src/tui.js` extracted: `pad16plus`, `getOptionsValue`, `mapOption`, `getPrintString`, `getPromptOption`, `buildExtensionMenuItems`, `toggleExtensionIntent`, `runInteractiveLoop`
- `index.js` dispatches subs → core options → loads registry → `buildExtensionMenuItems` → `runInteractiveLoop` (non-quiet) → `updatePackage` → `Tree.write(package.json+README.md)` → `runSetup`/`runRemove` on same `Tree` → `tree.commit()`
- Cancel via thrown `'cancelled'` error. Unresolved extensions show `[Unavailable]`
- 43 tests pass, biome clean

### Phase 4 — First-party extensions ✅
- New `pkgbld-plugin-biome` package (`src/index.js`, `src/templates/biome.tpl.json` — `.tpl` so root biome doesn't treat it as nested config)
- `pkgbld-plugin-swc` + `pkgbld-plugin-dts-buddy` gained `"./extension"` subpath export → `src/extension.js`
- `extensions.json` updated to real specifiers
- `create-pkgbld` devDeps include all three plugins (`workspace:*`); `pnpm-workspace.yaml` includes `pkgbld-plugin-biome`
- New `test/builtin-extensions.test.js`
- 47 tests pass, biome clean

### Phase 5 — Polish ✅
- `extensions-schema.json` (draft-07) + structural validator test
- `src/diff.js`: `renderChanges` with color-coded output + package.json key-level diff
- `src/conflicts.js`: `detectConflicts` + `recordOps` (intercepts write/delete/addDependency/addScript; skips `package.json` write to avoid double-counting)
- `src/install.js`: opt-in via `--install` flag; interactive mode also prompts confirm; `spawn`-based
- Wired into `subcommands.js` add/remove flow and `index.js` TUI flow
- `README.md` rewritten + `EXTENSIONS.md` authoring guide added
- `extensions-schema.json` + `extensions.json` added to `package.json` `files`
- 62 tests pass, biome clean

## QA verdict: SHIP

Post-QA fixes applied (F1/F2/F3):

| Finding | Fix |
|---|---|
| F2 — path traversal | `tree.js` `_key`/`_abs` guard throws `"Path escapes project root"` |
| F1 — no-op delete on missing file | `delete()` is a no-op when target missing |
| F3 — empty parent maps after remove | `removeDependency`/`removeScript` drop empty parent map; `updateJson()` skips identical-content write |

F4 (empty README in create mode) — pre-existing, left as-is.

71 tests pass, biome clean.

## TUI integration tests

`test/tui-flow.test.js` (8 tests) via `prompts.inject()` driving `runInteractiveLoop` directly.

Covers: status badges, toggle round-trips, full inject→commit, unavailable ext no-op, `prompts()` answer pass-through.

Minimal source change: exported `done` symbol from `tui.js` (was private const) for deterministic loop exit.

**Final count: 79 tests pass, biome clean** (full monorepo green, no cross-package regressions).
