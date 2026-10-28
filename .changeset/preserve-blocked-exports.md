---
'pkgbld': patch
---

Preserve null-valued export entries as blocked paths and skip them during source discovery and output rewriting. Blocked exact and wildcard subpaths no longer require sources or crash builds, and explicit root and package.json blockers remain intact.
