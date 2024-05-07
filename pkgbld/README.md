# pkgbld

*Build your libraries with ease*

Rollup-based build tool for building libraries based on package.json config and simple CLI options.

It is a simple building tool that supports building to different targets like `es`, `cjs`, `umd` without additional transformation other than minification using `terser` or preprocess using `rollup-plugin-preprocess`.

[Changelog](./CHANGELOG.md)

## Why

It is created to easily build libraries that contain multiple subpath exports (entry points, sub-packages) because it is not that easy to do at the moment with `microbundle`, `tsdx` or `ng-packagr` (if you are on Typescript).

## Installation

Using npm:
```
npm install --save-dev pkgbld
```

### Getting started (minimalistic start from scratch)

1. Start by creating package.json using `npm init`
2. Add pkgbld `npm install --save-dev pkgbld`
3. Create `src/index.ts`
4. Add pkgbld in the 'scripts' field of your package.json like:

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

Defines what subpath exports (entry points) should be compiled as umd bundles.

Example:

```
pkgbld --umd=index,core
```

Where `index,core` should be replaced by entry points that should be compiled in umd format, `index` is the top level `'.'` entry point.

If `package.json` defines the `umd` field option will default to `index``.

### compress

```
pkgbld --compress=es,umd
```

Where `es,umd` should be replaced by formats that should be compressed using terser. Default `umd`.

### sourcemaps

```
pkgbld --sourcemaps=es,cjs
```

Where `es,cjs` should be replaced by targets for which source maps should be generated. Default `umd`.

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

### dest

```
pkgbld --dest=dist
```

Directory to put output files.

### src

```
pkgbld --src=src
```

Directory to search for input files.

### bin

```
pkgbld --bin=./dist/index.cjs
```

File(s) to make executable. The first entry will be added to package.json

### include-externals

```
pkgbld --include-externals
```

or

```
pkgbld --include-externals=lodash
```

Bundles all or specified externals into a package.

### eject

```
pkgbld --eject
```

Ejects Rollup config.

### no-ts-config

Do not check/write tsconfig.json.

### no-update-package-json

```
pkgbld --no-update-package-json
```

Do not write package.json.

### commonjs-pattern

```
pkgbld --commonjs-pattern=[name].js
```

Defines the pattern for commonjs output files. Default is `[name].cjs`.

### esm-pattern

```
pkgbld --esm-pattern=[name].js
```

Defines the pattern for esm output files. Default is `[name].mjs`.

### umd-pattern

```
pkgbld --umd-pattern=[name].js
```

Defines the pattern for umd output files. Default is `[name].umd.js`.

### format-package-json

```
pkgbld --format-package-json
```

Formats package.json file.

### no-pack

Do not setup pack script in package.json

```
pkgbld --no-pack
```

### no-exports

```
pkgbld --no-exports
```

Do not add exports field in package.json.

### prune (command)

```
pkgbld prune
```

prune devDependencies and redundant scripts from package.json

### prune --profile=<profile>

There are two profiles: `library` and `app`. `library` is default.

Right now it only affects how `prune` command removes entries in the `scripts` field.

For `library` profile it retains: 'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'.

For `app` profile it retains in addition: 'prestart', 'start', 'poststart', 'prerestart', 'restart', 'postrestart', 'prestop', 'stop', 'poststop', 'pretest', 'test',        'posttest'.

### flatten

```
pkgbld prune --flatten=<directory>
```

Flattens file structure by moving all files from `dist` or other directory to the root directory and updating package.json.

If the directory is not specified it is guessed from package.json.

If files cannot be copied because of name conflicts the command will fail.

### removeSourcemaps

```
pkgbld prune --removeSourcemaps
```

Removes all sourcemaps from the package. The logic is very simple and removes all files with `.map` extension and references in format `//# sourceMappingURL=<mapFile>`.

### optimizeFiles (default)

```
pkgbld prune --optimizeFiles=false
```

Optimizes files by removing all files that are not required for pack at the given moment.

You might want to disable this option in some edge cases.

## Plugin API

`pkgbld` reads all installed packages named `pkgbld-plugin-*` and assumes they are plugins

Plugins suppose to implement one or more of the following interface methods as their package exports:

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
