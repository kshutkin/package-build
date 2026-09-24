# pkgbld-plugin-dts-buddy

A plugin for `pkgbld` that generates TypeScript declaration files using `dts-buddy` tool.

## Installation

```sh
npm install --save-dev pkgbld-plugin-dts-buddy
```

## Usage

pkgbld will automatically detect the plugin and generate declaration files.

## Behavior

The plugin enables declaration generation in `tsconfig.json`, updates the package `types` and export metadata, and runs `dts-buddy` after the JavaScript build completes. Each PKG BLD entry is exposed as a module in the generated declaration bundle.

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
