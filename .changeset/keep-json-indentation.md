---
"pkgbld": patch
"create-pkgbld": patch
---

Preserve existing JSON indentation when updating package manifests, TypeScript configs, extension-managed JSON files, and project locks. New files and files without detectable indentation continue to use two spaces.
