# create-pkgbld-extension-biome

## 0.2.0

### Minor Changes

- 44caf7e: Read and edit recognized JSONC configuration files through the extension Tree API, preserving existing comments and formatting. Allow explicit JSONC mode for custom filenames, compare JSONC extension resources structurally during updates, and recognize biome.jsonc during Biome detection and removal.
  
  Allow the upcoming Biome extension 0.2 release line in the official registry while retaining support for 0.1.
  
  Use PKG BLD's shared config discovery when DTS Buddy builds declarations, including projects inheriting an ancestor config.

## 0.1.1

### Patch Changes

- cd164d9: Add an extension system to `create-pkgbld` with interactive management and `list`, `add`, and `remove` subcommands. Extensions support dry runs, conflict detection, custom registries, optional dependency installation, and atomic file updates.
  
  Publish built-in integrations for Biome, the SWC build plugin, and the dts-buddy build plugin.
  
  Require modern PKG BLD plugins to declare their compatible `pkgbld` host range as a peer dependency.
