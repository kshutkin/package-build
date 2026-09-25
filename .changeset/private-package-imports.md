---
"pkgbld": minor
"pkgbld-plugin-swc": patch
"pkgbld-plugin-dts-buddy": patch
---

Build local `package.json#imports` targets at their declared paths while preserving private `#` specifiers for runtime resolution. Add `--no-imports` and `--conditions` for import handling and bundled dependency resolution. Keep private entries out of public declaration modules and make SWC work in ejected configs.
