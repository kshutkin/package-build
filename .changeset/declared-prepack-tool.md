---
'pkgbld': patch
---

Generate `npx -y pkgprn@^0.8.0` as the default prepack script so pruning works without a direct pkgprn dependency. Existing prepack scripts and the --no-pack opt-out are preserved.
