---
"create-pkgbld": minor
"create-pkgbld-extension-dts-buddy": patch
---

Support the create-pkgbld-extension-* package naming convention, rename the Biome extension, and add standalone DTS Buddy setup. Keep only official extension metadata in create-pkgbld and download selected packages into its shared internal cache instead of adding them as CLI or project dependencies. Record applied integrations in the versioned `.pkgbld-lock.json`, discover scoped and unscoped plugins from project dependency fields, and support explicit adoption and generic removal of third-party plugins.
