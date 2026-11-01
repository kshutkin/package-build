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

## TypeScript target

SWC uses `compilerOptions.target` from the nearest `tsconfig.json` or `jsconfig.json`, starting from the package's working
directory. At the same directory depth, `tsconfig.json` takes precedence. Comments, trailing commas, and inherited settings
through `extends` are supported. For example:

```json
{
  "compilerOptions": {
    "target": "ESNext"
  }
}
```

With this target, SWC preserves modern JavaScript syntax such as class fields while removing TypeScript types. Lower targets
downlevel newer syntax. If no target is configured, the plugin keeps its ES2020 fallback.

The plugin also respects `useDefineForClassFields`, including TypeScript's default of `true` for ES2022 and newer targets.
This prevents SWC's loose mode from rewriting native class fields into assignments when the configured target supports them.
Other SWC transforms retain the Rollup plugin's defaults.

The config is read even with `--no-ts-config`, which disables config updates. Ejected Rollup configurations contain the target
and class-field settings resolved at ejection time.

## License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
