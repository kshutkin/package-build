# pkgbld

*Build your libraries with ease*

Rollup based build tool for building libraries based on package.json config and simple CLI options.

It is a simple building tool that supports building to different targets like: `es`, `cjs`, `umd` without additional transformation other than minification using `terser` or preprocess using `rollup-plugin-preprocess`.

[Changlelog](./CHANGELOG.md)

## Why

It is created to easily build libraries that contains multiple subpath exports (entry points, subpackages) because it is not that easy to do at the moment with `microbundle`, `tsdx` or `ng-packagr` (if you are on Typescript).

## Installation

Using npm:
```
npm install --save-dev pkgbld
```

### Getting started (minimalistic start from scratch)

1. Start from creating pcakage.json using `npm init`
2. Add pkgbld `npm install --save-dev pkgbld`
3. Create `src/index.ts`
4. Add pkgbld in scripts field of your package.json like:

```json
  "scripts": {
    "build": "pkgbld"
  },
```

Run `npm run build`.

## package.json

`pkgbld` expects the name field to be filled in the package.json file. `exports` field defines what entries/outputs should be built for this package.

## CLI options

### umd

```
pkgbld --umd=index,core
```

Where `index,core` should be replaced by entry points that should be comiled in umd format, index is top level `'.'` entry point.

If `package.json` defined umd field option will be defaulted to `index`.

### compress

```
pkgbld --compress=es,umd
```

Where `es,umd` should be replaced by formats that should be compressed using terser.

### sourcemaps

```
pkgbld --sourcemaps=es,cjs
```

Where `es,cjs` should be replaced by targets for which sourcemaps should be generated. Default `umd`.

Supported targets for this option: `es`, `cjs` and `umd`.

### formats

```
pkgbld --formats=es
```

Defines what formats to build, only supports `es` and `cjs` at the moment. Use `umd` flag to build umd target.

### preprocess

```
pkgbld --preprocess=index
```

Defines what entry points/files should be preprocessed using `rollup-plugin-preprocess`. The entry point will be defined as variable es (for esm target), cjs (for commonjs) and umd (for umd) depending on the target type. Please request more variables / more granular logic if you want more.

### dir

```
pkgbld --dir=dist
```

Directory to put output files.

### sourcedir

```
pkgbld --sourcedir=src
```

Directory to search for input files.

### bin

```
pkgbld --bin=./dist/index.cjs,./dist/index.mjs
```

File(s) to make executable. First entry will be added to package.json

### include-externals

```
pkgbld --include-externals
```

Bundles all externals into a package.

### eject

```
pkgbld --eject
```

Ejects Rollup config.

### no-ts-config

```
pkgbld --no-ts-config
```

Do not check / write tsconfig.json.

### no-update-package-json

```
pkgbld --no-update-package-json
```

Do not write package.json.

## Plugin API

`pkgbld` reads all installed packages named `pkgbld-plugin-*` and assumes they are plugins

Plugins suppose to implement one or more of following interface methods as their package exports:

```
interface PkgbldPlugin {
    options(parsedArgs: {[key: string]: string | number}, options: ReturnType<typeof getCliOptions>): void;
    processPackageJson(packageJson: PackageJson, inputs: string[], logger: Logger): void;
    processTsConfig(config: Json): void;
    providePlugins(provider: Provider, config: Record<string, string | string[] | boolean>, inputs: string[]): Promise<void>;
    getExtraOutputSettings(format: InternalModuleFormat, inputs: string[]): Partial<OutputOptions>;
    buildEnd(): Promise<void>;
}
```

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
