# Changelog

## 1.4.5

### Patch Changes

- cc06bb8: make quiet really quiet
- 5f6883e: add newline to package.json same way as pkgbld does
- b203bae: stricter package.json parsing

## 1.4.4

### Patch Changes

- 5950c96: added more fields for ordering

## 1.4.3

### Patch Changes

- 5fac6a1: fix: handle author object

## 1.4.2

### Patch Changes

- 54ce107: fix typo

## 1.4.1

### Patch Changes

- ea0a7cb: remove redundunt debug console.log()
- 1e0d5a4: update packages to match new structure
- fd406cc: added missing `readme` field

## 1.4.0

### Minor Changes

- 1cf3eb4: more advanced implementation to allow create / update more complex packages (still some features missing)

## 1.3.0

### Minor Changes

- 3daff62: Added a menu to quickly edit package

## 1.2.0

### Minor Changes

- b4556f5: simplified package so it provides bare minimum of functionality, fixed issue running in current / another directory, added automatic directory creation

## 1.1.10

### Patch Changes

- 86c8d88: updated processing logic of default, module and types fields in package.json

## 1.1.9

### Patch Changes

- 74a7f67: fix small mistakes in documentation

## 1.1.8

### Patch Changes

- 1e29b8e: Fixed path to executable file in package.json

## 1.1.7

### Patch Changes

- fc6c99a: Updated documentation and links

## 1.1.6

### Patch Changes

- 03f2a71: Updated dependencies

## 1.1.5

### Patch Changes

- 85c2ae6: When creating subpackage, assume that subpackage should be created in subdirectory if package name (cli argument) is not provided

## [1.1.4](https://github.com/kshutkin/create-pkgbld/compare/v1.1.3...v1.1.4) (2022-11-01)

### Bug Fixes

- upgrade minimist from 1.2.6 to 1.2.7 ([#3](https://github.com/kshutkin/create-pkgbld/issues/3)) ([c24c8e3](https://github.com/kshutkin/create-pkgbld/commit/c24c8e3a838d409f980acf90142676312b207860))

## [1.1.3](https://github.com/kshutkin/create-pkgbld/compare/v1.1.2...v1.1.3) (2022-03-23)

### Bug Fixes

- readme link ([6009ea8](https://github.com/kshutkin/create-pkgbld/commit/6009ea82fe06af9d939c5dd4747f08a94955b3d4))

## [1.1.2](https://github.com/kshutkin/create-pkgbld/compare/v1.1.1...v1.1.2) (2022-03-23)

### Bug Fixes

- package.json & package-lock.json to reduce vulnerabilities ([#2](https://github.com/kshutkin/create-pkgbld/issues/2)) ([5d72496](https://github.com/kshutkin/create-pkgbld/commit/5d724967f1e1a4b33d24d197b99e15a7a244e301))

## [1.1.1](https://github.com/kshutkin/create-pkgbld/compare/v1.1.0...v1.1.1) (2022-02-13)

### Bug Fixes

- use dirname ([6a5d8bb](https://github.com/kshutkin/create-pkgbld/commit/6a5d8bb23580f1639671e92b922b6df744299dc9))

# [1.1.0](https://github.com/kshutkin/create-pkgbld/compare/v1.0.2...v1.1.0) (2022-02-13)

### Features

- display version on start ([c7c7051](https://github.com/kshutkin/create-pkgbld/commit/c7c7051bf4e4fe5f037891505de2addddf3b69ac))

## [1.0.2](https://github.com/kshutkin/create-pkgbld/compare/v1.0.1...v1.0.2) (2022-02-08)

### Bug Fixes

- do not cache ([ced7de5](https://github.com/kshutkin/create-pkgbld/commit/ced7de5f3e092c4a91afb92368364387725738c9))

## [1.0.1](https://github.com/kshutkin/create-pkgbld/compare/v1.0.0...v1.0.1) (2021-12-28)

### Bug Fixes

- undefined exception when run without arguments ([179e44a](https://github.com/kshutkin/create-pkgbld/commit/179e44a87fdfedb46b49053b2d7e245825188003))

# 1.0.0 (2021-12-27)

### Features

- initial implementation ([#1](https://github.com/kshutkin/create-pkgbld/issues/1)) ([1fa648a](https://github.com/kshutkin/create-pkgbld/commit/1fa648ad2a06ffbb9116efb3501c68cd40de40ce))
