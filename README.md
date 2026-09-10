![workflow](https://github.com/kshutkin/package-build/actions/workflows/main.yml/badge.svg)

# pkgbld

Monorepo for pkgbld and its utilities

## Packages

- [pkgbld](./pkgbld/README.md) - Pkgbld - build your libraries with ease
- [create-pkgbld](./create-pkgbld/README.md) - Scaffolding utility for pkgbld with a built-in extension system for adding/removing project features (linters, formatters, plugins).
- [pkgbld-plugin-swc](./pkgbld-plugin-swc) - pkgbld plugin to strip TypeScript types using SWC.
- [pkgbld-plugin-dts-buddy](./pkgbld-plugin-dts-buddy/README.md) - pkgbld plugin to generate `.d.ts` files using dts-buddy.
- [pkgbld-plugin-biome](./pkgbld-plugin-biome/README.md) - create-pkgbld extension that adds the Biome linter/formatter to a project.
- [cli-test-helper](./cli-test-helper/README.md) - Very simple helper module to test command line tools.
- [xc6](./xc6/README.md) - eXecute c(ommand) (xc6) is a command line tool to execute commands in a package.json script or a shell script.

## Extension system

`create-pkgbld` is more than a scaffolder: it can add or remove build features
(linters, formatters, pkgbld plugins, test runners, …) on any
`package.json`-based project through a registry of extensions.

```sh
npm create pkgbld          # interactive flow, includes an "Extensions" menu
create-pkgbld list         # list available extensions and their status
create-pkgbld add biome    # add a feature
create-pkgbld remove biome # remove a feature
```

Extensions are npm packages that export a small `manifest`/`setup`/`remove`
contract (declarative or programmatic) and operate on a virtual file tree that
is diffed and committed in one step. See
[create-pkgbld](./create-pkgbld/README.md) for usage and
[EXTENSIONS.md](./create-pkgbld/EXTENSIONS.md) for the authoring guide.

# License

[MIT](./LICENSE)
