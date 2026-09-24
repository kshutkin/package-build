# pkgbld-plugin-swc

A PKG BLD 2 plugin that strips TypeScript and TSX syntax with SWC.

## Installation

```sh
npm install --save-dev pkgbld pkgbld-plugin-swc
```

`pkgbld` automatically discovers the plugin from project dependencies. Keep the normal build script:

```json
{
  "scripts": {
    "build": "pkgbld"
  }
}
```

The plugin applies SWC only to TypeScript and TSX build entries; JavaScript entries continue through the regular PKG BLD pipeline.

It can also be added through `create-pkgbld`:

```sh
npx create-pkgbld add pkgbld-swc --install
```

## License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
