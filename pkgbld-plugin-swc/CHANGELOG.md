# pkgbld-plugin-swc

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
