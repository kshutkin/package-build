---
'pkgbld-plugin-swc': minor
---

Use the target and class-field semantics configured in tsconfig.json, including inherited settings, instead of always using SWC's ES2020 and loose-mode defaults. Preserve the existing ES2020 fallback when no target is configured and include resolved settings in ejected Rollup configurations.
