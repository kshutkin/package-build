---
'pkgbld': patch
---

Only generate a pkgprn prepack script when the project declares pkgprn in dependencies or devDependencies. Packages that install only pkgbld can build and pack without a missing-command failure. Existing prepack scripts and the --no-pack opt-out are preserved.
