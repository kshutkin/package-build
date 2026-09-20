const PLUGIN_PACKAGE_RE = /^(?:@[^/]+\/)?pkgbld-plugin-/;

/** @param {string} packageName */
export function isPluginPackageName(packageName) {
    return PLUGIN_PACKAGE_RE.test(packageName);
}
