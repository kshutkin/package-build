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

When installed, the plugin registers SWC for every public and private build configuration. JavaScript entries can import
TypeScript or TSX dependencies; SWC transforms the modules reached by the build.

It can also be added through `create-pkgbld`:

```sh
npx create-pkgbld add pkgbld-swc --install
```

## License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
