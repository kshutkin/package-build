---
'pkgbld': patch
---

Place the default export condition after custom conditions so the fallback does not hide branches such as browser or node. Preserve svelte priority, package-type ordering of import and require, and the relative order of custom conditions.
