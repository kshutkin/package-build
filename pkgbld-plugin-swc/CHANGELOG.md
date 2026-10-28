# pkgbld-plugin-swc

## 1.0.2

### Patch Changes

- dca4956: Always register SWC when the plugin is loaded, regardless of entry-file extensions. TypeScript dependencies of JavaScript public and private entries now build correctly, including with ejected configurations.
- Updated dependencies [df59802]
- Updated dependencies [9340d25]
- Updated dependencies [de60d42]
- Updated dependencies [8fde0d7]
- Updated dependencies [2591e28]
- Updated dependencies [17562dc]
  - pkgbld@2.1.1

## 1.0.1

### Patch Changes

- 4f769ac: Build local `package.json#imports` targets at their declared paths while preserving private `#` specifiers for runtime resolution. Add `--no-imports` and `--conditions` for import handling and bundled dependency resolution. Keep private entries out of public declaration modules and make SWC work in ejected configs.
- Updated dependencies [4f769ac]
  - pkgbld@2.1.0

## 1.0.0

### Major Changes

- cd164d9: Release `create-pkgbld` and the official build plugins on a new major version line for the modern PKG BLD plugin contract. The plugins declare the new `pkgbld` major range through their peer dependency, allowing compatible plugin generations to be identified from their published versions.
  
  Update the official plugins to the context-based lifecycle Interface and immutable Build configuration model.

### Patch Changes

- cd164d9: Add an extension system to `create-pkgbld` with interactive management and `list`, `add`, and `remove` subcommands. Extensions support dry runs, conflict detection, custom registries, optional dependency installation, and atomic file updates.
  
  Publish built-in integrations for Biome, the SWC build plugin, and the dts-buddy build plugin.
  
  Require modern PKG BLD plugins to declare their compatible `pkgbld` host range as a peer dependency.
- cd164d9: Update runtime dependencies to their latest compatible versions and remove the vulnerable Git config parser.
- Updated dependencies [cd164d9]
- Updated dependencies [cd164d9]
- Updated dependencies [cd164d9]
- Updated dependencies [cd164d9]
  - pkgbld@2.0.0
