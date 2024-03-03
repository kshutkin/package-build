# Changelog

## 1.2.2

### Patch Changes

- 6b6db84: fix preprocess plugin import

## 1.2.1

### Patch Changes

- f3ae3f1: update pkgbld-internal

## 1.2.0

### Minor Changes

- 5145047: - node 20 is minimal engine now
  - sort exports according to package type so `require` is higher than `import` for type === "module" and lower for type === "commonjs"
  - wait for tsconfig being processed before processing the package
  - do not write declarations if they are not enabled in tsconfig
  - remove 'packageManager' from package.json on prune
  - consume jsconfig.json
  - do not write exports option
  - handle directories.bin in package.json
  - use es modules where possible

## 1.1.18

### Patch Changes

- 5bde7c3: fix input extensions key (fixes input.undefined)

## 1.1.17

### Patch Changes

- 76069c2: fix get input extension argument (produces input.undefined input)

## 1.1.16

### Patch Changes

- 9fb37b7: added basic support for other input types (js, jsx, tsx)

## 1.1.15

### Patch Changes

- 17d8400: remove folders with seemingly redundant package.json

## 1.1.14

### Patch Changes

- 37dac35: added flatten option to prune command, added no-pack option

## 1.1.13

### Patch Changes

- 0091f32: added support for typesVersions

## 1.1.12

### Patch Changes

- 3d2d70a: update @rollup-extras/plugin-externals

## 1.1.11

### Patch Changes

- bb5743f: use pkgbld-internal if we have internal version

## 1.1.10

### Patch Changes

- d942874: use prune

## 1.1.9

### Patch Changes

- ba9f8ec: update with new functionality from pkgbld

## 1.1.8

### Patch Changes

- 9503fcb: fixed subpath exports ordering

## 1.1.7

### Patch Changes

- 65df407: update pkgbld-internal

## 1.1.6

### Patch Changes

- 30e3875: added \_\_dirname polyfill, do not eject helper in case of includeExternals === false

## 1.1.5

### Patch Changes

- 933f38a: update to latest pkgbld

## 1.1.4

### Patch Changes

- a5fceab: fix(deps): update dependency rollup to v4

## 1.1.3

### Patch Changes

- 2f58b8c: publish updates from pkgbld

## 1.1.2

### Patch Changes

- cab3ad7: allow defining filename patterns

## 1.1.1

### Patch Changes

- 1e0d5a4: update packages to match new structure

## 1.1.0

### Minor Changes

- 1cf3eb4: use cleye to parse command line arguments and show help

## 1.0.32

### Patch Changes

- 0804773: minor package changes: remove LICENSE from files, simplified author

## 1.0.31

### Patch Changes

- 20a4505: fix(deps): update dependency rollup-plugin-typescript2 to ^0.35.0

## 1.0.30

### Patch Changes

- 279b10e: Minor README changes

## 1.0.29

### Patch Changes

- 86c8d88: updated processing logic of default, module and types fields in package.json

## 1.0.28

### Patch Changes

- 643d964: fix(deps): update dependency @rollup/plugin-commonjs to v25

## 1.0.27

### Patch Changes

- 74a7f67: fix small mistakes in documentation

## 1.0.26

### Patch Changes

- 7277073: Implement plugin API

## 1.0.25

### Patch Changes

- e4b5c38: added extension to lodash subpath import, fixes import in ejected rollap.config.mjs

## 1.0.24

### Patch Changes

- 6b5a5ba: fixed ejecting lodash package dependency

## 1.0.23

### Patch Changes

- e752991: do not include subexports in package name

## 1.0.22

### Patch Changes

- 844eb84: fixed version numbers in updated package.json

## 1.0.21

### Patch Changes

- 9674080: removed debug console.log

## 1.0.20

### Patch Changes

- f7ff147: provide current input using curry, fixes mutliple umd outputs eject config case

## 1.0.19

### Patch Changes

- 44ed7e5: force update pkgbld-internal

## 1.0.18

### Patch Changes

- ae01361: fix internal-pkgbld

## 1.0.18

### Patch Changes

- 0794635: added missing dependency

## 1.0.17

### Patch Changes

- 5de5cc8: update implementation

## 1.0.16

### Patch Changes

- 38c69b3: fix(deps): update dependency rollup to v3.17.2

## 1.0.15

### Patch Changes

- 497d842: fix(deps): update dependency rollup to v3.17.1

## 1.0.14

### Patch Changes

- f8fb61a: fix(deps): update dependency rollup to v3.17.0

## 1.0.13

### Patch Changes

- fcdbeda: fix(deps): update dependency rollup to v3.16.0

## 1.0.12

### Patch Changes

- fc6c99a: Updated documentation and links

## 1.0.11

### Patch Changes

- 03f2a71: Updated dependencies

## 1.0.10

### Patch Changes

- 85c2ae6: Updated to latest pkgbld, fixed dependencies

## [1.0.9](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.8...v1.0.9) (2023-01-29)

### Bug Fixes

- update pkgbld ([96fd635](https://github.com/kshutkin/pkgbld-internal/commit/96fd6357e9cdae894f82bad15b7620c2970513d0))

## [1.0.8](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.7...v1.0.8) (2022-12-20)

### Bug Fixes

- include [@slimlib](https://github.com/slimlib) into package ([fe70b27](https://github.com/kshutkin/pkgbld-internal/commit/fe70b274b5ce2431256ae82b190c0247c81c5e3c))

## [1.0.7](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.6...v1.0.7) (2022-12-20)

### Bug Fixes

- added draftlog dependency ([f2d56e0](https://github.com/kshutkin/pkgbld-internal/commit/f2d56e01bddfa295398b5483c3479b1476d63bf0))

## [1.0.6](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.5...v1.0.6) (2022-11-23)

### Bug Fixes

- 🐛 bump pgkbld one more time ([b6db6c3](https://github.com/kshutkin/pkgbld-internal/commit/b6db6c32c87c1ef8b941cefde7baa769996a9499))

## [1.0.5](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.4...v1.0.5) (2022-11-23)

### Bug Fixes

- 🐛 update pkgbld to 1.10.0 ([9e630dd](https://github.com/kshutkin/pkgbld-internal/commit/9e630ddadf3a7b25f33ad07a366bc107aedba9cf))

## [1.0.4](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.3...v1.0.4) (2022-10-26)

### Bug Fixes

- bump pkgbld ([c52c250](https://github.com/kshutkin/pkgbld-internal/commit/c52c250143caa4117c25f689378e2199d14aefb5))
- lockfile ([1fddfcb](https://github.com/kshutkin/pkgbld-internal/commit/1fddfcb84bca2ca5dd4a86bd9f701c6d1a8ddd0c))

## [1.0.3](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.2...v1.0.3) (2022-10-25)

### Bug Fixes

- use fixed plugin @rollup-extras/plugin-externals ([5a4e44c](https://github.com/kshutkin/pkgbld-internal/commit/5a4e44c3600fd3e37b89a96e41d6a8bcaeae59b1))

## [1.0.2](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.1...v1.0.2) (2022-10-24)

### Bug Fixes

- add compat interop ([c4cebd4](https://github.com/kshutkin/pkgbld-internal/commit/c4cebd44e19ed26eedfa89a5f50ab5cefb834de2))

## [1.0.1](https://github.com/kshutkin/pkgbld-internal/compare/v1.0.0...v1.0.1) (2022-10-24)

### Bug Fixes

- make it commonjs ([691e473](https://github.com/kshutkin/pkgbld-internal/commit/691e4735ee0fb1f4778ab96f1176dee102cafa23))

# 1.0.0 (2022-10-24)

### Features

- initial implementation ([f7d6638](https://github.com/kshutkin/pkgbld-internal/commit/f7d663896d9e3fe7d75085d176e265b7218a0b26))
