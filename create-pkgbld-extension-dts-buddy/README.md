# create-pkgbld-extension-dts-buddy

A create-pkgbld extension for standalone declaration bundling. It installs
`dts-buddy` and TypeScript and adds `build:types`, without installing a PKG BLD plugin.

```sh
npx create-pkgbld add dts-buddy --install
npm run build:types
```

Before running the script, configure `tsconfig.json` and your package entry points.
DTS Buddy reads `exports` entries with `import` or `default` strings and writes to
`package.json#types` (or `index.d.ts` when omitted). For example:

```json
{
    "name": "my-library",
    "types": "./types/index.d.ts",
    "exports": {
        ".": { "types": "./types/index.d.ts", "default": "./src/index.js" }
    }
}
```

For explicit entry points, customize the script:
`dts-buddy types/index.d.ts -m my-library:src/index.ts`.
Include the generated declarations in your published package.

`create-pkgbld remove dts-buddy` removes DTS Buddy and `build:types`.
TypeScript, package metadata, configuration and generated declarations are retained.
For generation during PKG BLD builds, use `create-pkgbld add pkgbld-dts-buddy` instead.

## License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
