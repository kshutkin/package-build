---
'pkgbld': patch
---

Refresh existing string-valued import and require export conditions to match emitted files, including subpath exports and custom output patterns. This prevents successful builds from leaving stale paths that fail at runtime.
