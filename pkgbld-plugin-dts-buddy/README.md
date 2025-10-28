# pkgbld-plugin-dts-buddy

A plugin for `pkgbld` that generates TypeScript declaration files using `dts-buddy` tool.

## Installation

```sh
npm install --save-dev pkgbld-plugin-dts-buddy
```

## Usage

pkgbld will automatically detect the plugin and generate declaration files.

## Behavior

This plugin automatically sets the `noSubpackages` option to `true` when loaded. This means that pkgbld will not create subpackage directories with `package.json` files for non-index entry points.

This is the recommended approach when using `dts-buddy`, as it bundles type definitions in a way that provides proper module resolution without requiring separate subpackage directories.

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
