# create-pkgbld

Scaffold packages built with [PKG BLD](https://github.com/kshutkin/package-build/tree/main/pkgbld) and manage their build plugins and project setup extensions.

## Usage

```sh
npm init pkgbld
npm init pkgbld <directory>
```

For a new package, `create-pkgbld` generates the initial package metadata and
README. In an existing package, it opens the interactive package manager for
adding, removing, or adopting integrations. Pending changes are shown before
they are written.

Use `--quiet` (`-q`) to suppress informational output and the interactive
package manager. Use `--install` to run the detected package manager after
dependency changes.

## Package management

| Command | Behavior |
|---|---|
| `create-pkgbld list` | List official integrations, locked integrations, and modern plugins declared by the project. Listing is offline and does not change the project. |
| `create-pkgbld add <package>` | Apply an official integration, restore a locked one, or adopt an installed unmanaged plugin. |
| `create-pkgbld remove <package>` | Remove an integration and its project-lock entry. Unregistered plugins are removed from every dependency field. |
| `create-pkgbld update <package>` | Update one managed official integration to the newest stable version allowed by its registry range. |

Package names may be registry names such as `biome` and
`pkgbld-dts-buddy`, or the full name of a discovered plugin.

### Flags

| Flag | Description |
|---|---|
| `--yes`, `-y` | Use extension prompt defaults. It does not approve update conflicts. |
| `--dry-run` | Resolve and display changes without writing the project or installing dependencies. |
| `--quiet`, `-q` | Suppress informational output. |
| `--install` | Run the detected package manager after add, remove, or extension-update dependency changes. |
| `--accept-conflicts` | Update only: accept proposed replacements for resources customized since the locked version. |

Build plugin updates always install and verify the exact target version before
advancing the project lock, regardless of `--install`.

```sh
create-pkgbld add biome --yes --dry-run
create-pkgbld add biome --yes --install
create-pkgbld remove biome --yes
create-pkgbld update biome --dry-run
create-pkgbld update biome --yes --accept-conflicts
```

## Official integrations

| Name | Purpose |
|---|---|
| `biome` | Biome linting and formatting |
| `pkgbld-swc` | TypeScript stripping through `pkgbld-plugin-swc` |
| `dts-buddy` | Standalone declaration bundling |
| `pkgbld-dts-buddy` | Declaration bundling through `pkgbld-plugin-dts-buddy` |

The bundled registry contains metadata only. Selected extension versions are
downloaded into a version-isolated shared cache located with
`find-cache-directory`; set `CREATE_PKGBLD_CACHE_DIR` to override its location.
Extension packages are not added to the target project. Build plugins and tools
configured by an extension are normal project dependencies.

Applied or adopted integrations are recorded by canonical package name and
exact version in the committed `.pkgbld-lock.json`:

```json
{
  "$schema": "https://unpkg.com/create-pkgbld/lock-schema-v1.json",
  "packages": {
    "create-pkgbld-extension-biome": "0.1.1",
    "@author/pkgbld-plugin-example": "2.1.0"
  }
}
```

Plugins named `pkgbld-plugin-*` or `@scope/pkgbld-plugin-*` are discovered in
`dependencies`, `devDependencies`, and `peerDependencies` without executing
their code. A manageable plugin must declare a `pkgbld` range in
`peerDependencies`. The range is validated before add and update; legacy or
unresolved plugins are excluded with an actionable warning.

Updates compare the locked extension contract, the current project, and the
target contract. Unchanged resources update automatically. Customized
resources are displayed as conflicts and require interactive approval or
`--accept-conflicts`.

See the [PKG BLD plugin interface](https://github.com/kshutkin/package-build/blob/main/pkgbld/README.md#build-plugin-interface) for build plugin authoring,
[EXTENSIONS.md](./EXTENSIONS.md) for optional project setup behavior, and
[DESIGN.md](./DESIGN.md) for package-management semantics.

[Changelog](./CHANGELOG.md) · [License](https://github.com/kshutkin/package-build/blob/main/LICENSE)
