---
'pkgbld': patch
---

Normalize string-valued root exports before assigning generated output conditions. Packages with `exports: { ".": "./dist/index.mjs" }` now build successfully instead of crashing when setting require or default paths.
