# Changelog

## 1.35.1

### Patch Changes

- c6455d6: fix no build because of circular dependency in dynamic import in node >=23.8.0

## 1.35.0

### Minor Changes

- 2be33a6: added loading plugins from workspace root

## 1.34.1

### Patch Changes

- 23056c6: update packages, fix lint errors

## 1.34.0

### Minor Changes

- bde5817: updated dependencies

### Patch Changes

- 158a9e7: fix(deps): update dependency rollup to v4.22.4 [security]
- f03de7d: fix: isEmptyDir should be awaited

## 1.33.1

### Patch Changes

- 737885b: ignore node_modules when doing prune with `--remove-sourcemaps`

## 1.33.0

### Minor Changes

- 03d4dbb: added remove-legal-comments flag

## 1.32.2

### Patch Changes

- 56da37b: remove also line when removing sourcemap comment

## 1.32.1

### Patch Changes

- f56efeb: fix and simplify externals

## 1.32.0

### Minor Changes

- 0921a94: added json plugin

## 1.31.2

### Patch Changes

- 7b85311: update commonjs plugin

## 1.31.1

### Patch Changes

- c336296: fix docs about plugin

## 1.31.0

### Minor Changes

- cb126d3: new API for plugins

## 1.30.1

### Patch Changes

- ff03e3b: also handle directories.bin explicit flatten

## 1.30.0

### Minor Changes

- 2eb3f45: added no-clean and no-bundle options & basic tests
- 86dc4bb: added 2 more options to prune: removeSourcemaps and optimizeFiles

### Patch Changes

- 3183d8e: fixed prune logic:

  - handle case with no scripts (it was crashing)
  - handle creating directories that don't exist on flatten (it was crashing)
  - added tests

## 1.29.4

### Patch Changes

- 29f84ce: use >= to reference typescript

## 1.29.3

### Patch Changes

- be41a7a: better types generated

## 1.29.2

### Patch Changes

- 6b6db84: fix preprocess plugin import

## 1.29.1

### Patch Changes

- 995cf22: fix \_\_dirname not defined

## 1.29.0

### Minor Changes

- 5145047: - node 20 is minimal engine now
  - sort exports according to package type so `require` is higher than `import` for type === "module" and lower for type === "commonjs"
  - wait for tsconfig being processed before processing the package
  - do not write declarations if they are not enabled in tsconfig
  - remove 'packageManager' from package.json on prune
  - consume jsconfig.json
  - do not write exports option
  - handle directories.bin in package.json
  - use es modules where possible

## 1.28.2

### Patch Changes

- 5bde7c3: fix input extensions key (fixes input.undefined)

## 1.28.1

### Patch Changes

- 23129e5: do not build typeings for pkgbld, as we are not exporting them
- 76069c2: fix get input extension argument (produces input.undefined input)

## 1.28.0

### Minor Changes

- 9fb37b7: added basic support for other input types (js, jsx, tsx)

## 1.27.1

### Patch Changes

- 17d8400: remove folders with seemingly redundant package.json

## 1.27.0

### Minor Changes

- 37dac35: added flatten option to prune command, added no-pack option

## 1.26.0

### Minor Changes

- 0091f32: added support for typesVersions

## 1.25.0

### Minor Changes

- 3d2d70a: update @rollup-extras/plugin-externals

## 1.24.2

### Patch Changes

- bb5743f: use pkgbld-internal if we have internal version

## 1.24.1

### Patch Changes

- d942874: use prune

## 1.24.0

### Minor Changes

- ba9f8ec: added prune command

## 1.23.1

### Patch Changes

- 9503fcb: fixed subpath exports ordering

## 1.23.0

### Minor Changes

- 657659c: add types property to subpath exports

## 1.22.1

### Patch Changes

- 30e3875: added \_\_dirname polyfill, do not eject helper in case of includeExternals === false

## 1.22.0

### Minor Changes

- 270b7ad: changed `dir` to `dest` and `srcDir` to `src`

## 1.21.1

### Patch Changes

- a5fceab: fix(deps): update dependency rollup to v4

## 1.21.0

### Minor Changes

- 3aa08a2: added format-package-json option

## 1.20.0

### Minor Changes

- 0438287: use shared internal library to parse options / package.json

### Patch Changes

- 639f507: fixed bug in pkgbld --include-externals: it was not working with pnpm workspaces
- d107e06: updated rollup-plugin-typescript2

## 1.19.0

### Minor Changes

- e24ae43: extend include-externals

## 1.18.0

### Minor Changes

- cab3ad7: allow defining filename patterns

## 1.17.1

### Patch Changes

- 1e0d5a4: update packages to match new structure

## 1.17.0

### Minor Changes

- 1cf3eb4: use cleye to parse command line arguments and show help

## 1.16.7

### Patch Changes

- 4646ffa: Fixed typo

## 1.16.6

### Patch Changes

- 0804773: minor package changes: remove LICENSE from files, simplified author

## 1.16.5

### Patch Changes

- 20a4505: fix(deps): update dependency rollup-plugin-typescript2 to ^0.35.0

## 1.16.4

### Patch Changes

- 279b10e: Minor README changes

## 1.16.3

### Patch Changes

- 86c8d88: updated processing logic of default, module and types fields in package.json

## 1.16.2

### Patch Changes

- 643d964: fix(deps): update dependency @rollup/plugin-commonjs to v25

## 1.16.1

### Patch Changes

- 74a7f67: fix small mistakes in documentation

## 1.16.0

### Minor Changes

- 7277073: Implement plugin API

## 1.15.7

### Patch Changes

- e4b5c38: added extension to lodash subpath import, fixes import in ejected rollap.config.mjs

## 1.15.6

### Patch Changes

- 6b5a5ba: fixed ejecting lodash package dependency

## 1.15.5

### Patch Changes

- e752991: do not include subexports in package name

## 1.15.4

### Patch Changes

- 844eb84: fixed version numbers in updated package.json

## 1.15.3

### Patch Changes

- 9674080: removed debug console.log

## 1.15.2

### Patch Changes

- f7ff147: provide current input using curry, fixes mutliple umd outputs eject config case

## 1.15.1

### Patch Changes

- ae01361: fix internal-pkgbld

## 1.15.0

### Minor Changes

- d306334: feat: disable package.json write
- 6484d4b: feat: eject config

## 1.14.6

### Patch Changes

- 38c69b3: fix(deps): update dependency rollup to v3.17.2

## 1.14.5

### Patch Changes

- 497d842: fix(deps): update dependency rollup to v3.17.1

## 1.14.4

### Patch Changes

- f8fb61a: fix(deps): update dependency rollup to v3.17.0

## 1.14.3

### Patch Changes

- fcdbeda: fix(deps): update dependency rollup to v3.16.0

## 1.14.2

### Patch Changes

- fc6c99a: Updated documentation and links

## 1.14.1

### Patch Changes

- 03f2a71: Updated dependencies

# [1.14.0](https://github.com/kshutkin/package-build/compare/v1.13.0...v1.14.0) (2023-02-09)

### Features

- added include-externals option ([67faed2](https://github.com/kshutkin/package-build/commit/67faed26e99af9179f27b6317c54de8fd3bfd876))

# [1.13.0](https://github.com/kshutkin/package-build/compare/v1.12.0...v1.13.0) (2023-01-31)

### Features

- added bin field support ([65402c9](https://github.com/kshutkin/package-build/commit/65402c9d5805503a25f495640ee5eff7995babfb))

# [1.12.0](https://github.com/kshutkin/package-build/compare/v1.11.2...v1.12.0) (2023-01-28)

### Features

- new configs logic ([#84](https://github.com/kshutkin/package-build/issues/84)) ([3c1437a](https://github.com/kshutkin/package-build/commit/3c1437a6a5a7315cb4847ec15aeae806a9943728))

## [1.11.2](https://github.com/kshutkin/package-build/compare/v1.11.1...v1.11.2) (2023-01-27)

### Bug Fixes

- upgrade @rollup/plugin-terser from 0.2.1 to 0.3.0 ([#85](https://github.com/kshutkin/package-build/issues/85)) ([1fcb93d](https://github.com/kshutkin/package-build/commit/1fcb93de1c5d15f22dcff376a042c3bda50277b3))

## [1.11.1](https://github.com/kshutkin/package-build/compare/v1.11.0...v1.11.1) (2023-01-15)

### Bug Fixes

- updated plugin-externals ([c8000a3](https://github.com/kshutkin/package-build/commit/c8000a3dd3f2800696176b5aeba1c1132ef4a8c2))

# [1.11.0](https://github.com/kshutkin/package-build/compare/v1.10.4...v1.11.0) (2023-01-02)

### Features

- 🎸 update packages ([fb6663d](https://github.com/kshutkin/package-build/commit/fb6663d8096db053fc5f54369dd131aa87e0bec5))

## [1.10.4](https://github.com/kshutkin/package-build/compare/v1.10.3...v1.10.4) (2023-01-02)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 23.0.3 to 23.0.4 ([#83](https://github.com/kshutkin/package-build/issues/83)) ([925fc06](https://github.com/kshutkin/package-build/commit/925fc061fbcd2a0ec90bca54b3416f79dd7df5f4))

## [1.10.3](https://github.com/kshutkin/package-build/compare/v1.10.2...v1.10.3) (2023-01-02)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 23.0.2 to 23.0.3 ([#81](https://github.com/kshutkin/package-build/issues/81)) ([176c887](https://github.com/kshutkin/package-build/commit/176c88715d782aba79a748bb9da9bc35cef25787))

## [1.10.2](https://github.com/kshutkin/package-build/compare/v1.10.1...v1.10.2) (2022-12-30)

### Bug Fixes

- upgrade typescript from 4.9.3 to 4.9.4 ([#82](https://github.com/kshutkin/package-build/issues/82)) ([97b9a05](https://github.com/kshutkin/package-build/commit/97b9a057405d9f20d1ffbe8e2718aaa328546ecc))

## [1.10.1](https://github.com/kshutkin/package-build/compare/v1.10.0...v1.10.1) (2022-11-23)

### Bug Fixes

- 🐛 bump rollup and typescript ([95206dd](https://github.com/kshutkin/package-build/commit/95206dd9d3037f9c20c2ebc6cf1464d2040ea9e1))

# [1.10.0](https://github.com/kshutkin/package-build/compare/v1.9.2...v1.10.0) (2022-11-23)

### Features

- 🎸 build all inputs in parallel ([0bfe182](https://github.com/kshutkin/package-build/commit/0bfe1822f660ba22373b5447c093ae8b6764a615))

## [1.9.2](https://github.com/kshutkin/package-build/compare/v1.9.1...v1.9.2) (2022-11-01)

### Bug Fixes

- upgrade draftlog appender so it is not used in CI environment ([d809640](https://github.com/kshutkin/package-build/commit/d809640b505eea6f32cbeabcd2ca0eae832685fb))

## [1.9.1](https://github.com/kshutkin/package-build/compare/v1.9.0...v1.9.1) (2022-11-01)

### Bug Fixes

- updated dependencies ([c295f86](https://github.com/kshutkin/package-build/commit/c295f8654651d7539499c664469a151adc15845e))

# [1.9.0](https://github.com/kshutkin/package-build/compare/v1.8.0...v1.9.0) (2022-10-25)

### Bug Fixes

- remove unused preprocess ([e032622](https://github.com/kshutkin/package-build/commit/e032622d9051e0d9ad86eb3583d4f3d02307abc4))
- upgrade packages (externals fixes) ([6bd93f2](https://github.com/kshutkin/package-build/commit/6bd93f23ff4caf6ff9e33d7b531c074fe933fe88))

### Features

- upgrade packages ([1306db6](https://github.com/kshutkin/package-build/commit/1306db6a12288fd3bc34ea145ed8a2f3f00a4b38))
- use draftlog appender ([4acde9d](https://github.com/kshutkin/package-build/commit/4acde9dbc2732f6a02b75ccbf1403e96a360fb4e))

# [1.8.0](https://github.com/kshutkin/package-build/compare/v1.7.1...v1.8.0) (2022-10-24)

### Features

- added main field so it is possible to import the package ([8b33670](https://github.com/kshutkin/package-build/commit/8b33670bc1071615e9ef475106449c4e16c759d5))

## [1.7.1](https://github.com/kshutkin/package-build/compare/v1.7.0...v1.7.1) (2022-10-20)

### Bug Fixes

- write main and type into subpackages package.json ([9246cdd](https://github.com/kshutkin/package-build/commit/9246cdd4946cf3b25fef1fc5397850a91612c46d))

# [1.7.0](https://github.com/kshutkin/package-build/compare/v1.6.0...v1.7.0) (2022-10-14)

### Features

- move to rollup 3.x ([#79](https://github.com/kshutkin/package-build/issues/79)) ([212e351](https://github.com/kshutkin/package-build/commit/212e351eb56fdc2a640c9e6185182dfd62215522))

# [1.6.0](https://github.com/kshutkin/package-build/compare/v1.5.5...v1.6.0) (2022-10-06)

### Features

- added sourcedir cli option ([6869ab5](https://github.com/kshutkin/package-build/commit/6869ab59a9549dd2ade90c4e5366ad5f11d62e28))

## [1.5.5](https://github.com/kshutkin/package-build/compare/v1.5.4...v1.5.5) (2022-10-06)

### Bug Fixes

- missing package ([3586984](https://github.com/kshutkin/package-build/commit/35869848eaaae8eb56c45e42459b234988b58218))
- use externals, shared instance for clean plugin ([1ff0cee](https://github.com/kshutkin/package-build/commit/1ff0cee2bd318bdc6b9fd1327fef25a7745489b9))

## [1.5.4](https://github.com/kshutkin/package-build/compare/v1.5.3...v1.5.4) (2022-10-06)

### Bug Fixes

- actually use @rollup-extras/plugin-clean ([4050d61](https://github.com/kshutkin/package-build/commit/4050d61976de05ecfa922b196c14c167d78ea958))

## [1.5.3](https://github.com/kshutkin/package-build/compare/v1.5.2...v1.5.3) (2022-10-04)

### Bug Fixes

- update rollup-plugin-typescript2 ([b97978f](https://github.com/kshutkin/package-build/commit/b97978f04444d1b7eb0a0998ca2063637e70de88))

## [1.5.2](https://github.com/kshutkin/package-build/compare/v1.5.1...v1.5.2) (2022-10-04)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 14.0.1 to 14.1.0 ([#76](https://github.com/kshutkin/package-build/issues/76)) ([4494858](https://github.com/kshutkin/package-build/commit/4494858e38f3816a27ade60a6e8f1d72f6af339e))

## [1.5.1](https://github.com/kshutkin/package-build/compare/v1.5.0...v1.5.1) (2022-10-02)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 14.0.0 to 14.0.1 ([#75](https://github.com/kshutkin/package-build/issues/75)) ([f9cc31e](https://github.com/kshutkin/package-build/commit/f9cc31e143a76920644cb588a1cfa4b4b2deb63b))

# [1.5.0](https://github.com/kshutkin/package-build/compare/v1.4.17...v1.5.0) (2022-09-29)

### Bug Fixes

- upgrade typescript from 4.8.2 to 4.8.3 ([#74](https://github.com/kshutkin/package-build/issues/74)) ([fac0199](https://github.com/kshutkin/package-build/commit/fac0199841f254a2a32838ed1a80057bcd0374ea))

### Features

- upgrade @rollup/plugin-node-resolve from 13.3.0 to 14.0.0 ([#73](https://github.com/kshutkin/package-build/issues/73)) ([c773ee5](https://github.com/kshutkin/package-build/commit/c773ee5a5f6150c1369e9652288d5089512422ab))

## [1.4.17](https://github.com/kshutkin/package-build/compare/v1.4.16...v1.4.17) (2022-09-21)

### Bug Fixes

- upgrade rollup from 2.78.1 to 2.79.0 ([#72](https://github.com/kshutkin/package-build/issues/72)) ([f9ba148](https://github.com/kshutkin/package-build/commit/f9ba148e7ebc705c144e89e732ef9e0f16de02dc))

## [1.4.16](https://github.com/kshutkin/package-build/compare/v1.4.15...v1.4.16) (2022-09-18)

### Bug Fixes

- upgrade typescript from 4.7.4 to 4.8.2 ([#71](https://github.com/kshutkin/package-build/issues/71)) ([13ec6ad](https://github.com/kshutkin/package-build/commit/13ec6adf014ed1f8783b6cfefa7902aa949e67c9))

## [1.4.15](https://github.com/kshutkin/package-build/compare/v1.4.14...v1.4.15) (2022-09-18)

### Bug Fixes

- move plugin-clean to dependencies ([79eb798](https://github.com/kshutkin/package-build/commit/79eb79859a53c6b43554a0323e39fd3cd7d99584))

## [1.4.14](https://github.com/kshutkin/package-build/compare/v1.4.13...v1.4.14) (2022-09-10)

### Bug Fixes

- upgrade rollup-plugin-typescript2 from 0.32.1 to 0.33.0 ([#70](https://github.com/kshutkin/package-build/issues/70)) ([d10ad0f](https://github.com/kshutkin/package-build/commit/d10ad0f05e506e3383e240f91805110b3085c5a1))

## [1.4.13](https://github.com/kshutkin/package-build/compare/v1.4.12...v1.4.13) (2022-09-09)

### Bug Fixes

- upgrade rollup from 2.78.0 to 2.78.1 ([#69](https://github.com/kshutkin/package-build/issues/69)) ([ce5ac4a](https://github.com/kshutkin/package-build/commit/ce5ac4acff97943c1d48c877871055be7a26e4f6))

## [1.4.12](https://github.com/kshutkin/package-build/compare/v1.4.11...v1.4.12) (2022-09-04)

### Bug Fixes

- upgrade rollup from 2.77.3 to 2.78.0 ([#68](https://github.com/kshutkin/package-build/issues/68)) ([f9c39dc](https://github.com/kshutkin/package-build/commit/f9c39dcb7f9ccd210d5a9399ca236bc75c9c81a0))

## [1.4.11](https://github.com/kshutkin/package-build/compare/v1.4.10...v1.4.11) (2022-09-02)

### Bug Fixes

- upgrade rollup from 2.77.2 to 2.77.3 ([#67](https://github.com/kshutkin/package-build/issues/67)) ([cfbc322](https://github.com/kshutkin/package-build/commit/cfbc3221d06486722267edb71b3f26b4d43c727f))

## [1.4.10](https://github.com/kshutkin/package-build/compare/v1.4.9...v1.4.10) (2022-08-27)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 22.0.1 to 22.0.2 ([#66](https://github.com/kshutkin/package-build/issues/66)) ([07f44f8](https://github.com/kshutkin/package-build/commit/07f44f8217a9a5e47eaaf873df5f2e06594c6787))

## [1.4.9](https://github.com/kshutkin/package-build/compare/v1.4.8...v1.4.9) (2022-08-22)

### Bug Fixes

- upgrade rollup from 2.77.1 to 2.77.2 ([#64](https://github.com/kshutkin/package-build/issues/64)) ([4256e15](https://github.com/kshutkin/package-build/commit/4256e157d29e2dcbbb68998e6787a85709fb094c))

## [1.4.8](https://github.com/kshutkin/package-build/compare/v1.4.7...v1.4.8) (2022-08-21)

### Bug Fixes

- upgrade is-builtin-module from 3.1.0 to 3.2.0 ([#65](https://github.com/kshutkin/package-build/issues/65)) ([cc3ad6f](https://github.com/kshutkin/package-build/commit/cc3ad6f61041d9f0ed099bdf7cdfece53df72bc3))

## [1.4.7](https://github.com/kshutkin/package-build/compare/v1.4.6...v1.4.7) (2022-08-17)

### Bug Fixes

- upgrade rollup from 2.77.0 to 2.77.1 ([#63](https://github.com/kshutkin/package-build/issues/63)) ([b952385](https://github.com/kshutkin/package-build/commit/b95238533b525dc53f7232fce529ec0cd4a41607))

## [1.4.6](https://github.com/kshutkin/package-build/compare/v1.4.5...v1.4.6) (2022-08-06)

### Bug Fixes

- upgrade rollup from 2.76.0 to 2.77.0 ([#62](https://github.com/kshutkin/package-build/issues/62)) ([cb72cf5](https://github.com/kshutkin/package-build/commit/cb72cf563df0007409a64987abfd0e2f787a34cf))

## [1.4.5](https://github.com/kshutkin/package-build/compare/v1.4.4...v1.4.5) (2022-07-30)

### Bug Fixes

- upgrade rollup from 2.75.7 to 2.76.0 ([#61](https://github.com/kshutkin/package-build/issues/61)) ([fb32059](https://github.com/kshutkin/package-build/commit/fb32059b3ebf1b46731eaee37d1ec2ce6619a6f8))

## [1.4.4](https://github.com/kshutkin/package-build/compare/v1.4.3...v1.4.4) (2022-07-24)

### Bug Fixes

- upgrade @niceties/logger from 1.1.3 to 1.1.4 ([#60](https://github.com/kshutkin/package-build/issues/60)) ([27ced2d](https://github.com/kshutkin/package-build/commit/27ced2d40571d34e927133c57b4dab10b4f41ebf))

## [1.4.3](https://github.com/kshutkin/package-build/compare/v1.4.2...v1.4.3) (2022-07-16)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 22.0.0 to 22.0.1 ([#58](https://github.com/kshutkin/package-build/issues/58)) ([6fd7ef5](https://github.com/kshutkin/package-build/commit/6fd7ef50dffd1e05a2c3ed884371294f595b726c))

## [1.4.2](https://github.com/kshutkin/package-build/compare/v1.4.1...v1.4.2) (2022-07-12)

### Bug Fixes

- upgrade rollup from 2.75.6 to 2.75.7 ([#57](https://github.com/kshutkin/package-build/issues/57)) ([2341a3b](https://github.com/kshutkin/package-build/commit/2341a3bce40d021348d2c758af287f029754d9a0))

## [1.4.1](https://github.com/kshutkin/package-build/compare/v1.4.0...v1.4.1) (2022-07-10)

### Bug Fixes

- upgrade typescript from 4.7.3 to 4.7.4 ([#56](https://github.com/kshutkin/package-build/issues/56)) ([986be39](https://github.com/kshutkin/package-build/commit/986be39ab19e4e72c985908de243eb9d3c5ecbc6))

# [1.4.0](https://github.com/kshutkin/package-build/compare/v1.3.0...v1.4.0) (2022-07-08)

### Features

- upgrade @rollup/plugin-commonjs from 21.1.0 to 22.0.0 ([#55](https://github.com/kshutkin/package-build/issues/55)) ([11a862d](https://github.com/kshutkin/package-build/commit/11a862d378b8ca6312f80af46bf77358a495fecc))

# [1.3.0](https://github.com/kshutkin/package-build/compare/v1.2.24...v1.3.0) (2022-07-02)

### Features

- improve build process ([aedc4a6](https://github.com/kshutkin/package-build/commit/aedc4a63d2e5ead8ae2518be0a76640cdbcb492e))

## [1.2.24](https://github.com/kshutkin/package-build/compare/v1.2.23...v1.2.24) (2022-06-29)

### Bug Fixes

- upgrade rollup from 2.75.5 to 2.75.6 ([#53](https://github.com/kshutkin/package-build/issues/53)) ([b44c329](https://github.com/kshutkin/package-build/commit/b44c3297348bb2d918f5413f7122c26fe286c501))

## [1.2.23](https://github.com/kshutkin/package-build/compare/v1.2.22...v1.2.23) (2022-06-29)

### Bug Fixes

- upgrade rollup-plugin-typescript2 from 0.32.0 to 0.32.1 ([#54](https://github.com/kshutkin/package-build/issues/54)) ([0739439](https://github.com/kshutkin/package-build/commit/0739439f9db12c0cf87c6ca234a5f23d3ce85525))

## [1.2.22](https://github.com/kshutkin/package-build/compare/v1.2.21...v1.2.22) (2022-06-27)

### Bug Fixes

- upgrade rollup-plugin-typescript2 from 0.31.2 to 0.32.0 ([#50](https://github.com/kshutkin/package-build/issues/50)) ([f8cdd7b](https://github.com/kshutkin/package-build/commit/f8cdd7bbdda3df458bdc5fab53c0855fa0efa6fa))

## [1.2.21](https://github.com/kshutkin/package-build/compare/v1.2.20...v1.2.21) (2022-06-26)

### Bug Fixes

- upgrade rollup from 2.75.3 to 2.75.5 ([#49](https://github.com/kshutkin/package-build/issues/49)) ([7e2dccf](https://github.com/kshutkin/package-build/commit/7e2dccf764e4cba3be6dff55f21e09e99c8362dd))
- upgrade typescript from 4.7.2 to 4.7.3 ([#51](https://github.com/kshutkin/package-build/issues/51)) ([b4c633a](https://github.com/kshutkin/package-build/commit/b4c633a95e7ff99ee6fe35c1137b6261161dab46))

## [1.2.20](https://github.com/kshutkin/package-build/compare/v1.2.19...v1.2.20) (2022-06-21)

### Bug Fixes

- upgrade rollup from 2.75.0 to 2.75.3 ([#48](https://github.com/kshutkin/package-build/issues/48)) ([83ccef0](https://github.com/kshutkin/package-build/commit/83ccef0ba45e56d5d7c343f677ee9bf09ac060e2))

## [1.2.19](https://github.com/kshutkin/package-build/compare/v1.2.18...v1.2.19) (2022-06-19)

### Bug Fixes

- upgrade rollup from 2.74.1 to 2.75.0 ([#47](https://github.com/kshutkin/package-build/issues/47)) ([9662849](https://github.com/kshutkin/package-build/commit/9662849b8f09ec5ac088d0b79f418565b48d965a))

## [1.2.18](https://github.com/kshutkin/package-build/compare/v1.2.17...v1.2.18) (2022-06-15)

### Bug Fixes

- upgrade typescript from 4.6.4 to 4.7.2 ([#46](https://github.com/kshutkin/package-build/issues/46)) ([22d11de](https://github.com/kshutkin/package-build/commit/22d11de461268322c737017a9f309c69b7cf4dd9))

## [1.2.17](https://github.com/kshutkin/package-build/compare/v1.2.16...v1.2.17) (2022-06-10)

### Bug Fixes

- upgrade rollup from 2.73.0 to 2.74.1 ([#45](https://github.com/kshutkin/package-build/issues/45)) ([d368954](https://github.com/kshutkin/package-build/commit/d3689545432be80b62af3bd623be9ffabb8e17b9))

## [1.2.16](https://github.com/kshutkin/package-build/compare/v1.2.15...v1.2.16) (2022-06-04)

### Bug Fixes

- upgrade rollup from 2.72.1 to 2.73.0 ([#43](https://github.com/kshutkin/package-build/issues/43)) ([b96bc2a](https://github.com/kshutkin/package-build/commit/b96bc2a93416eb7ee064e8f2a5743c635c6d1be8))

## [1.2.15](https://github.com/kshutkin/package-build/compare/v1.2.14...v1.2.15) (2022-05-30)

### Bug Fixes

- upgrade rollup from 2.71.1 to 2.72.1 ([#41](https://github.com/kshutkin/package-build/issues/41)) ([73b4e2e](https://github.com/kshutkin/package-build/commit/73b4e2e29f7cf25a5a1c8d1ec0913edcfaa51809))

## [1.2.14](https://github.com/kshutkin/package-build/compare/v1.2.13...v1.2.14) (2022-05-29)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 13.2.1 to 13.3.0 ([#40](https://github.com/kshutkin/package-build/issues/40)) ([4f8e3d1](https://github.com/kshutkin/package-build/commit/4f8e3d1acc8aa1eddbbdef8c4faa957e9fcbe2e4))
- upgrade rollup from 2.70.2 to 2.71.1 ([#39](https://github.com/kshutkin/package-build/issues/39)) ([78261a8](https://github.com/kshutkin/package-build/commit/78261a8b2ec2cbaa0f3aafa7ebab6892e519061a))

## [1.2.13](https://github.com/kshutkin/package-build/compare/v1.2.12...v1.2.13) (2022-05-20)

### Bug Fixes

- upgrade typescript from 4.6.3 to 4.6.4 ([#38](https://github.com/kshutkin/package-build/issues/38)) ([67480f1](https://github.com/kshutkin/package-build/commit/67480f1c0e474dcc0ba3e554f4265117f211d032))

## [1.2.12](https://github.com/kshutkin/package-build/compare/v1.2.11...v1.2.12) (2022-05-14)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 21.0.3 to 21.1.0 ([#36](https://github.com/kshutkin/package-build/issues/36)) ([d95c5bb](https://github.com/kshutkin/package-build/commit/d95c5bb2de6b051239de8361b1073012a76a31d0))
- upgrade rollup from 2.70.1 to 2.70.2 ([#37](https://github.com/kshutkin/package-build/issues/37)) ([ddf7179](https://github.com/kshutkin/package-build/commit/ddf7179216dfa39df037e37df102ab826954b971))

## [1.2.11](https://github.com/kshutkin/package-build/compare/v1.2.10...v1.2.11) (2022-05-14)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 13.2.0 to 13.2.1 ([#35](https://github.com/kshutkin/package-build/issues/35)) ([20d4726](https://github.com/kshutkin/package-build/commit/20d472627bde964a711ddd8e193f305a76841516))

## [1.2.10](https://github.com/kshutkin/package-build/compare/v1.2.9...v1.2.10) (2022-05-03)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 13.1.3 to 13.2.0 ([#34](https://github.com/kshutkin/package-build/issues/34)) ([59f9ec3](https://github.com/kshutkin/package-build/commit/59f9ec37e18e0c719720bd3dae7fd42481e9bc20))

## [1.2.9](https://github.com/kshutkin/package-build/compare/v1.2.8...v1.2.9) (2022-04-24)

### Bug Fixes

- upgrade @niceties/logger from 1.1.1 to 1.1.3 ([#31](https://github.com/kshutkin/package-build/issues/31)) ([756f24e](https://github.com/kshutkin/package-build/commit/756f24e5633ac856cdfbe16917a789e161fe25a1))

## [1.2.8](https://github.com/kshutkin/package-build/compare/v1.2.7...v1.2.8) (2022-04-18)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 21.0.2 to 21.0.3 ([#33](https://github.com/kshutkin/package-build/issues/33)) ([d23bb36](https://github.com/kshutkin/package-build/commit/d23bb36f4156f1cc4c723e7c16744afd55e618aa))

## [1.2.7](https://github.com/kshutkin/package-build/compare/v1.2.6...v1.2.7) (2022-04-15)

### Bug Fixes

- upgrade typescript from 4.6.2 to 4.6.3 ([#32](https://github.com/kshutkin/package-build/issues/32)) ([877e431](https://github.com/kshutkin/package-build/commit/877e431835f742c88ce63fd92d667263888b5ccf))

## [1.2.6](https://github.com/kshutkin/package-build/compare/v1.2.5...v1.2.6) (2022-04-05)

### Bug Fixes

- upgrade rollup from 2.70.0 to 2.70.1 ([#30](https://github.com/kshutkin/package-build/issues/30)) ([028368e](https://github.com/kshutkin/package-build/commit/028368e3e39b753c61900bc0e86d811dba9a24fe))

## [1.2.5](https://github.com/kshutkin/package-build/compare/v1.2.4...v1.2.5) (2022-03-29)

### Bug Fixes

- upgrade rollup from 2.69.2 to 2.70.0 ([#29](https://github.com/kshutkin/package-build/issues/29)) ([7128ef8](https://github.com/kshutkin/package-build/commit/7128ef8f3567e6e79a4dbbe800bc953717b56dce))

## [1.2.4](https://github.com/kshutkin/package-build/compare/v1.2.3...v1.2.4) (2022-03-28)

### Bug Fixes

- upgrade rollup from 2.69.1 to 2.69.2 ([#28](https://github.com/kshutkin/package-build/issues/28)) ([b000001](https://github.com/kshutkin/package-build/commit/b0000018364222e49515052cdec5d6bc5e5a2915))

## [1.2.3](https://github.com/kshutkin/package-build/compare/v1.2.2...v1.2.3) (2022-03-26)

### Bug Fixes

- upgrade rollup from 2.69.0 to 2.69.1 ([#27](https://github.com/kshutkin/package-build/issues/27)) ([1c04c1d](https://github.com/kshutkin/package-build/commit/1c04c1db13f99c9bd9df9ba8bf0f32d3b0277ca5))

## [1.2.2](https://github.com/kshutkin/package-build/compare/v1.2.1...v1.2.2) (2022-03-24)

### Bug Fixes

- upgrade rollup from 2.68.0 to 2.69.0 ([#26](https://github.com/kshutkin/package-build/issues/26)) ([6c9bd1b](https://github.com/kshutkin/package-build/commit/6c9bd1bfe3213ad04607c4022a43c0a0438b277c))

## [1.2.1](https://github.com/kshutkin/package-build/compare/v1.2.0...v1.2.1) (2022-03-23)

### Bug Fixes

- readme url ([9af2f96](https://github.com/kshutkin/package-build/commit/9af2f966a1e43fa2639610fb87199a259fc47c62))

# [1.2.0](https://github.com/kshutkin/package-build/compare/v1.1.20...v1.2.0) (2022-03-23)

### Features

- export ./package.json ([41eb421](https://github.com/kshutkin/package-build/commit/41eb4218e2d16535922d7cf3c2b0b73e561530f6))

## [1.1.20](https://github.com/kshutkin/package-build/compare/v1.1.19...v1.1.20) (2022-03-23)

### Bug Fixes

- package.json & package-lock.json to reduce vulnerabilities ([#24](https://github.com/kshutkin/package-build/issues/24)) ([b6d0c29](https://github.com/kshutkin/package-build/commit/b6d0c291a7db083e8241770e85252020c7f29574))
- upgrade typescript from 4.5.5 to 4.6.2 ([#25](https://github.com/kshutkin/package-build/issues/25)) ([c2d9b4f](https://github.com/kshutkin/package-build/commit/c2d9b4f5f50fab1c8b229fca39aab1dea2be6c8d))

## [1.1.19](https://github.com/kshutkin/package-build/compare/v1.1.18...v1.1.19) (2022-03-17)

### Bug Fixes

- upgrade @rollup/plugin-commonjs from 21.0.1 to 21.0.2 ([#23](https://github.com/kshutkin/package-build/issues/23)) ([d19d60d](https://github.com/kshutkin/package-build/commit/d19d60d9d59da990c940ea06f173136ef8cac4fc))

## [1.1.18](https://github.com/kshutkin/package-build/compare/v1.1.17...v1.1.18) (2022-03-16)

### Bug Fixes

- upgrade rollup from 2.67.3 to 2.68.0 ([#22](https://github.com/kshutkin/package-build/issues/22)) ([0748917](https://github.com/kshutkin/package-build/commit/0748917f628df8df61adda80802ea64b7e4c945a))

## [1.1.17](https://github.com/kshutkin/package-build/compare/v1.1.16...v1.1.17) (2022-03-11)

### Bug Fixes

- upgrade rollup from 2.67.2 to 2.67.3 ([#21](https://github.com/kshutkin/package-build/issues/21)) ([f796747](https://github.com/kshutkin/package-build/commit/f7967475f68a2b1f346c15638a029d3dfad6409e))

## [1.1.16](https://github.com/kshutkin/package-build/compare/v1.1.15...v1.1.16) (2022-03-03)

### Bug Fixes

- upgrade rollup from 2.67.1 to 2.67.2 ([#20](https://github.com/kshutkin/package-build/issues/20)) ([94b280e](https://github.com/kshutkin/package-build/commit/94b280e576717b2997eeaa93c6f628210e730e0b))

## [1.1.15](https://github.com/kshutkin/package-build/compare/v1.1.14...v1.1.15) (2022-03-01)

### Bug Fixes

- upgrade rollup from 2.67.0 to 2.67.1 ([#19](https://github.com/kshutkin/package-build/issues/19)) ([e4002b5](https://github.com/kshutkin/package-build/commit/e4002b5d0289eecccb69bec12471b0ed2f4e84bf))

## [1.1.14](https://github.com/kshutkin/package-build/compare/v1.1.13...v1.1.14) (2022-02-24)

### Bug Fixes

- upgrade rollup from 2.66.1 to 2.67.0 ([#18](https://github.com/kshutkin/package-build/issues/18)) ([2e9c29b](https://github.com/kshutkin/package-build/commit/2e9c29b3cafbe454a6adaf7e7fe0ed4ac5027bfd))

## [1.1.13](https://github.com/kshutkin/package-build/compare/v1.1.12...v1.1.13) (2022-02-23)

### Bug Fixes

- upgrade rollup-plugin-typescript2 from 0.31.1 to 0.31.2 ([#17](https://github.com/kshutkin/package-build/issues/17)) ([c07c51e](https://github.com/kshutkin/package-build/commit/c07c51e67a5b806d2d55b266415f0791cf617a8a))

## [1.1.12](https://github.com/kshutkin/package-build/compare/v1.1.11...v1.1.12) (2022-02-16)

### Bug Fixes

- upgrade rollup from 2.66.0 to 2.66.1 ([#16](https://github.com/kshutkin/package-build/issues/16)) ([bfe675d](https://github.com/kshutkin/package-build/commit/bfe675deea8c1261b890da7fae4aea4c03b5df77))

## [1.1.11](https://github.com/kshutkin/package-build/compare/v1.1.10...v1.1.11) (2022-02-13)

### Bug Fixes

- upgrade rollup from 2.65.0 to 2.66.0 ([#15](https://github.com/kshutkin/package-build/issues/15)) ([f8040fc](https://github.com/kshutkin/package-build/commit/f8040fc9274c57e0da3d272a13bb5a80bde425fd))

## [1.1.10](https://github.com/kshutkin/package-build/compare/v1.1.9...v1.1.10) (2022-02-12)

### Bug Fixes

- upgrade rollup from 2.64.0 to 2.65.0 ([#14](https://github.com/kshutkin/package-build/issues/14)) ([de57c6c](https://github.com/kshutkin/package-build/commit/de57c6ccd52430a808b87569b6ae3912703aa6a7))
- upgrade typescript from 4.5.4 to 4.5.5 ([#13](https://github.com/kshutkin/package-build/issues/13)) ([0589ad5](https://github.com/kshutkin/package-build/commit/0589ad5b7e3fa444eb96d1ef440722363cb4df62))

## [1.1.9](https://github.com/kshutkin/package-build/compare/v1.1.8...v1.1.9) (2022-02-06)

### Bug Fixes

- upgrade rollup from 2.63.0 to 2.64.0 ([#12](https://github.com/kshutkin/package-build/issues/12)) ([faefb1f](https://github.com/kshutkin/package-build/commit/faefb1f71ad71afb3dc5a5c69bce66ba8e6c7279))

## [1.1.8](https://github.com/kshutkin/package-build/compare/v1.1.7...v1.1.8) (2022-01-31)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 13.1.2 to 13.1.3 ([#10](https://github.com/kshutkin/package-build/issues/10)) ([fffbff8](https://github.com/kshutkin/package-build/commit/fffbff87e317c2cf519608508d2fa3d6a82eaae8))

## [1.1.7](https://github.com/kshutkin/package-build/compare/v1.1.6...v1.1.7) (2022-01-25)

### Bug Fixes

- upgrade rollup from 2.62.0 to 2.63.0 ([#9](https://github.com/kshutkin/package-build/issues/9)) ([503bbdd](https://github.com/kshutkin/package-build/commit/503bbdd99d0c965bb89bb5e7f7ec0200ddb956e3))

## [1.1.6](https://github.com/kshutkin/package-build/compare/v1.1.5...v1.1.6) (2022-01-22)

### Bug Fixes

- upgrade @niceties/logger from 1.1.0 to 1.1.1 ([#8](https://github.com/kshutkin/package-build/issues/8)) ([d5d684f](https://github.com/kshutkin/package-build/commit/d5d684fbf51a71e5f61c3d983c577b31e3ea660e))

## [1.1.5](https://github.com/kshutkin/package-build/compare/v1.1.4...v1.1.5) (2022-01-21)

### Bug Fixes

- upgrade @niceties/logger from 1.0.4 to 1.1.0 ([#6](https://github.com/kshutkin/package-build/issues/6)) ([809f0d6](https://github.com/kshutkin/package-build/commit/809f0d629a23ca0e3b1e9e8e1088b604bdbc6f34))
- upgrade @rollup/plugin-node-resolve from 13.1.1 to 13.1.2 ([#7](https://github.com/kshutkin/package-build/issues/7)) ([de3987b](https://github.com/kshutkin/package-build/commit/de3987bf66bcfc909c470a73a1188c64e62e42bc))

## [1.1.4](https://github.com/kshutkin/package-build/compare/v1.1.3...v1.1.4) (2022-01-17)

### Bug Fixes

- upgrade rollup from 2.61.1 to 2.62.0 ([#5](https://github.com/kshutkin/package-build/issues/5)) ([ab77556](https://github.com/kshutkin/package-build/commit/ab77556b51b986f51714fe271d804299ef86b129))

## [1.1.3](https://github.com/kshutkin/package-build/compare/v1.1.2...v1.1.3) (2022-01-06)

### Bug Fixes

- upgrade @rollup/plugin-node-resolve from 13.0.6 to 13.1.1 ([#4](https://github.com/kshutkin/package-build/issues/4)) ([7e66aee](https://github.com/kshutkin/package-build/commit/7e66aee290f7a77aca38e53f6faf0292963074b7))
- upgrade rollup from 2.60.1 to 2.61.1 ([#3](https://github.com/kshutkin/package-build/issues/3)) ([f41c017](https://github.com/kshutkin/package-build/commit/f41c0175c05b563755f5e95e748a662bf5604c39))

## [1.1.2](https://github.com/kshutkin/package-build/compare/v1.1.1...v1.1.2) (2021-12-29)

### Bug Fixes

- write new line at the end of package.json ([47b9b42](https://github.com/kshutkin/package-build/commit/47b9b42ee653a4abf12a6b24bee048925eda6e23))

## [1.1.1](https://github.com/kshutkin/package-build/compare/v1.1.0...v1.1.1) (2021-12-27)

### Bug Fixes

- scope check ([b2c9b70](https://github.com/kshutkin/package-build/commit/b2c9b70f11c72870b0427954def24d22dde5ddf7))

# [1.1.0](https://github.com/kshutkin/package-build/compare/v1.0.0...v1.1.0) (2021-12-23)

### Features

- rename package ([#2](https://github.com/kshutkin/package-build/issues/2)) ([9ec814d](https://github.com/kshutkin/package-build/commit/9ec814dbb1cd9c0813aeecd50b363af9fdfc3738))

# 1.0.0 (2021-12-23)

### Features

- initial implementation ([#1](https://github.com/kshutkin/package-build/issues/1)) ([18c08f7](https://github.com/kshutkin/package-build/commit/18c08f7b086070ceb045ceba855a55f40b65850d))
