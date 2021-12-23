# Package Build

Rollup based build tool for building libraries based on package.json config and simple CLI options.

It is simple building tool that supports building to different targets like: `es`, `cjs`, `umd` without additional trasformation other than minification using `terser` or preprocess using `rollup-plugin-preprocess`.

## Why

It is created to easily build libraries that contains mutliple subpackages (exports, entry points) because it is not that easy to do at the moment with `microbundle`, `tsdx` or `ng-packager`.

## Installation

Using npm:
```
npm install --save-dev package-build
```

## package.json

`package-build` expects name field to be filled in package.json file. `exports` field defined what entries/outputs should be build for this package.

## CLI options

### umd

```
package-build --umd=index,core
```

Where `index,core` should be replaced by entry points that should be comiled in umd format, index is top level `'.'` entry point.

If `package.json` defined umd field option will be defaulted to `index`.

### compress

```
package-build --compress=index,core
```

Where `index,core` should be replaced by entry points that should be compressed using terser.

### sourcemaps

```
package-build --sourcemaps=es,cjs
```

Where `es,cjs` should be replaced by targets for which sourcemaps should be generated. Default `umd`.

Supported targets for this option: `es`, `cjs` and `umd`.

### formats

```
package-build --formats=es
```

Defines what formats to build, only supports `es` and `cjs` at the moment. Use `umd` flag to build umd target.

### preprocess

```
package-build --preprocess=index
```

Defines what entry points/files should be preprocessed using `rollup-plugin-preprocess`.

### dir

```
package-build --dir=dist
```

Directory to use for build.

# License

[MIT](./LICENSE)
