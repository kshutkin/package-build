---
"pkgbld": patch
"pkgbld-internal": patch
---

fixed prune logic:

- handle case with no scripts (it was crashing)
- handle creating directories that don't exist on flatten (it was crashing)
- added tests
