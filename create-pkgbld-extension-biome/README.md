# create-pkgbld-extension-biome

A [create-pkgbld](https://github.com/kshutkin/package-build/tree/main/create-pkgbld) extension that wires [Biome](https://biomejs.dev) (linter + formatter) into a project.

Installed via:

```sh
npx create-pkgbld add biome
```

Adds `@biomejs/biome` to your project's devDependencies, `lint` / `lint:fix` scripts, and a default `biome.json`.

Detection and removal recognize both `biome.json` and `biome.jsonc`.

## License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
