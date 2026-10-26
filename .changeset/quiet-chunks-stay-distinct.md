---
'pkgbld': patch
---

Add content hashes to generated ES and CommonJS chunk filenames to prevent separate builds from overwriting same-named chunks. Public and private entry filenames remain unchanged.
