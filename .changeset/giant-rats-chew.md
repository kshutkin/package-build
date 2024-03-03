---
"pkgbld-internal": minor
"create-pkgbld": minor
"pkgbld": minor
---

- node 20 is minimal engine now
- sort exports according to package type so `require` is higher than `import` for type === "module" and lower for type === "commonjs"
- wait for tsconfig being processed before processing the package
- do not write declarations if they are not enabled in tsconfig
- remove 'packageManager' from package.json on prune
- consume jsconfig.json
- do not write exports option
- handle directories.bin in package.json
- use es modules where possible