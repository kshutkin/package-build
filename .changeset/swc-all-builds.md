---
'pkgbld-plugin-swc': patch
---

Always register SWC when the plugin is loaded, regardless of entry-file extensions. TypeScript dependencies of JavaScript public and private entries now build correctly, including with ejected configurations.
