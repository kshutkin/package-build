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

The project mode is detected automatically and its workflow starts directly:

- A new project is created from detected defaults.
- An existing project opens package management, where you can add official
  packages or manage PKG BLD plugins declared by the project.

Pending changes are diffed once before commit.

### Flags

| Flag | Description |
|---|---|
| `--quiet`, `-q` | Suppress informational output and the interactive menu. |
| `--install` | After commit, if dependencies changed, run `<pm> install` (`pnpm`/`yarn`/`npm`, auto-detected from lockfile). Never runs without this flag in non-interactive mode. |

## Subcommands

### `create-pkgbld list`

List official packages, locked integrations, and PKG BLD plugins discovered in
the project's dependency fields. States include `[Available]`, `[Applied]`,
`[Installed, managed]`, `[Installed, unmanaged]`, and `[Unavailable]`. Listing
does not download packages or change the project lock.

### `create-pkgbld add <extension>`

Run an available package's setup or explicitly adopt an installed unmanaged
plugin. Prints a colored diff of pending changes (with `package.json` key-level
diff), then commits it together with `.pkgbld-lock.json`.

### `create-pkgbld remove <extension>`

Reverse of `add`.

### `create-pkgbld update <extension>`

Update one managed official package to the newest stable version allowed by
its registry range. The command compares the old and new extension contracts
with the current project, displays proposed replacements for customized
resources, and asks before applying conflicts. In non-interactive mode, pass
`--accept-conflicts` to approve those replacements; `--yes` alone does not.

Build plugin updates always install and verify the exact target version before
advancing `.pkgbld-lock.json`. Extension implementations remain in the shared
cache and are not installed into the project.

### Subcommand flags

| Flag | Description |
|---|---|
| `--yes`, `-y` | Skip prompts; use defaults for any extension-provided prompts. |
| `--dry-run` | Print the diff but write nothing. Implies no install. |
| `--quiet`, `-q` | Suppress informational output. |
| `--install` | After commit, run `<pm> install` if dependencies changed. In interactive mode (no `--yes`) you will also be prompted. In `--yes` mode, install only runs when `--install` is also passed. |
| `--accept-conflicts` | Update only: accept proposed replacements for resources changed since the locked version. |

### Examples

```sh
# Preview what `biome` would add, no writes
create-pkgbld add biome --yes --dry-run

# Add biome, write files, then install
create-pkgbld add biome --yes --install

# Remove a feature
create-pkgbld remove biome --yes

# Preview an update and then accept its reviewed migration conflicts
create-pkgbld update biome --dry-run
create-pkgbld update biome --yes --accept-conflicts
```

## Extensions

The built-in registry currently includes:

- `biome` — Biome linter/formatter
- `pkgbld-swc` — SWC TypeScript stripping via `pkgbld-plugin-swc`
- `dts-buddy` — standalone d.ts bundling via `create-pkgbld-extension-dts-buddy`
- `pkgbld-dts-buddy` — d.ts bundling via `pkgbld-plugin-dts-buddy`

The built-in registry contains package metadata rather than extension code.
Selecting an official extension downloads it into a shared internal cache in
the platform-standard location selected by `find-cache-directory`. Extension
packages are not added to the target project's dependencies. Build plugins and
tools requested by an extension are still added to the project when needed.
Set `CREATE_PKGBLD_CACHE_DIR` to override the cache location.

Applied integrations are recorded by canonical package name and exact version
in the committed `.pkgbld-lock.json` file:

```json
{
  "$schema": "https://unpkg.com/create-pkgbld/lock-schema-v1.json",
  "packages": {
    "create-pkgbld-extension-biome": "0.1.0",
    "@author/pkgbld-plugin-example": "1.2.3"
  }
}
```

Plugins named `pkgbld-plugin-*` or `@scope/pkgbld-plugin-*` are discovered
from `dependencies`, `devDependencies`, and `peerDependencies`. An installed
plugin that is absent from the lock can be removed or explicitly adopted.
Modern plugins must declare `pkgbld` in `peerDependencies`; legacy or
unresolvable candidates are omitted with an upgrade or install-dependencies
warning.

For the contract that extension packages must implement, see
[EXTENSIONS.md](./EXTENSIONS.md). Package discovery and management behavior is
specified in [DESIGN.md](./DESIGN.md).

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
