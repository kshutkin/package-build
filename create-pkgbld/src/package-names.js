const PLUGIN_PACKAGE_RE = /^(?:@[^/]+\/)?pkgbld-plugin-/;
const EXTENSION_PACKAGE_RE = /^(?:@[^/]+\/)?create-pkgbld-extension-/;
const LOCK_PACKAGE_RE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?(?:create-pkgbld-extension-|pkgbld-plugin-)[a-z0-9][a-z0-9._~-]*$/;

/** @param {string} packageName */
export function isPluginPackageName(packageName) {
    return PLUGIN_PACKAGE_RE.test(packageName);
}

/** @param {string} packageName */
export function isExtensionPackageName(packageName) {
    return EXTENSION_PACKAGE_RE.test(packageName);
}

/** @param {string} packageName @returns {'plugin' | 'extension' | null} */
export function getPackageKind(packageName) {
    if (isPluginPackageName(packageName)) return 'plugin';
    if (isExtensionPackageName(packageName)) return 'extension';
    return null;
}

/** @param {string} packageName */
export function isLockPackageName(packageName) {
    return LOCK_PACKAGE_RE.test(packageName);
}
