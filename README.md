# pkgbld

Rollup based build tool for building libraries based on package.json config and simple CLI options.

It is simple building tool that supports building to different targets like: `es`, `cjs`, `umd` without additional trasformation other than minification using `terser` or preprocess using `rollup-plugin-preprocess`.

## Why

It is created to easily build libraries that contains mutliple subpackages (exports, entry points) because it is not that easy to do at the moment with `microbundle`, `tsdx` or `ng-packagr`.

## Installation

Using npm:
```
npm install --save-dev pkgbld
```

## package.json

`pkgbld` expects name field to be filled in package.json file. `exports` field defined what entries/outputs should be build for this package.

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

Defines what entry points/files should be preprocessed using `rollup-plugin-preprocess`. For the entry point will be defined variable esm (for esm target) or cjs (for others) depending on the target type. Please request more variables / more granular logic if you want more.

### dir

```
pkgbld --dir=dist
```

Directory to put output files.

# License

[MIT](./LICENSE)
