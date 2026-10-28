---
'create-pkgbld': patch
---

Normalize absolute and relative Tree paths to the same project-relative key. Sequential package operations now retain each other's staged changes instead of silently overwriting them, and lock-file commit filtering works with absolute paths.
