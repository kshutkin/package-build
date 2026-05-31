# create-pkgbld

Minimalistic scaffolding utility for [pkgbld](https://github.com/kshutkin/package-build/tree/main/pkgbld), with an extension system for adding/removing project features (linters, formatters, plugins, …).

*Disclaimer:* Despite the version being 1.0.0+ it is still very raw, use only if it fits your needs.

[Changelog](./CHANGELOG.md)

## Usage

Scaffold or update a project (default interactive flow):

```
npm init pkgbld
npm init pkgbld <folder name>
```

The default flow walks you through `package.json`, git, and pkgbld options
in an interactive menu. The same menu includes an **Extensions** section
where you can toggle each registered extension on or off; pending changes
are diffed once before commit.

### Flags

| Flag | Description |
|---|---|
| `--quiet`, `-q` | Suppress informational output and the interactive menu. |
| `--install` | After commit, if dependencies changed, run `<pm> install` (`pnpm`/`yarn`/`npm`, auto-detected from lockfile). Never runs without this flag in non-interactive mode. |

## Subcommands

### `create-pkgbld list`

List all extensions in the registry (built-in + project-local
`.pkgbld-extensions.json`), with `[Installed]` / `[Not installed]` /
`[Unresolved: …]` status.

### `create-pkgbld add <extension>`

Run the extension's `setup` against the current directory. Prints a
colored diff of pending changes (with `package.json` key-level diff),
then commits.

### `create-pkgbld remove <extension>`

Reverse of `add`.

### Subcommand flags

| Flag | Description |
|---|---|
| `--yes`, `-y` | Skip prompts; use defaults for any extension-provided prompts. |
| `--dry-run` | Print the diff but write nothing. Implies no install. |
| `--quiet`, `-q` | Suppress informational output. |
| `--registry <path>` | Use a custom registry JSON file in place of the built-in. |
| `--install` | After commit, run `<pm> install` if dependencies changed. In interactive mode (no `--yes`) you will also be prompted. In `--yes` mode, install only runs when `--install` is also passed. |

### Examples

```sh
# Preview what `biome` would add, no writes
create-pkgbld add biome --yes --dry-run

# Add biome, write files, then install
create-pkgbld add biome --yes --install

# Remove a feature
create-pkgbld remove biome --yes
```

## Extensions

The built-in registry currently includes:

- `biome` — Biome linter/formatter
- `pkgbld-swc` — SWC TypeScript stripping via `pkgbld-plugin-swc`
- `pkgbld-dts-buddy` — d.ts bundling via `pkgbld-plugin-dts-buddy`

To add your own, ship a per-project `.pkgbld-extensions.json`:

```json
{
  "$schema": "node_modules/create-pkgbld/extensions-schema.json",
  "extensions": [
    { "name": "my-ext", "package": "my-ext-pkg", "description": "My extension" }
  ]
}
```

For the contract that extension packages must implement, see
[EXTENSIONS.md](./EXTENSIONS.md).

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
