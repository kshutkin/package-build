# pkgbld-plugin-dts-buddy

A plugin for `pkgbld` that generates TypeScript declaration files using `dts-buddy` tool.

## Installation

```sh
npm install --save-dev pkgbld-plugin-dts-buddy
```

## Usage

pkgbld will automatically detect the plugin and generate declaration files.

## Behavior

The plugin enables declaration generation in `tsconfig.json`, updates the package `types` and export metadata, and runs `dts-buddy` after the JavaScript build completes. Public PKG BLD entries are exposed as modules in the generated declaration bundle. Private `package.json#imports` entries and declaration targets are left to their own declaration producer.

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
