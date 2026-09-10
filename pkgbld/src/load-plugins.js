/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 */

/**
 * @param {PackageJson} pkg
 * @param {Set<string>} loaded
 */
export async function loadPlugins(pkg, loaded) {
    try {
        return await Promise.all(
            [
                ...new Set([
                    ...Object.keys(pkg.devDependencies || {}),
                    ...Object.keys(pkg.dependencies || {}),
                    ...Object.keys(pkg.peerDependencies || {}),
                ]),
            ]
                .filter(packageName => packageName.startsWith('pkgbld-plugin-') && !loaded.has(packageName))
                .map(async packageName => {
                    loaded.add(packageName);
                    const pluginFactory = await import(packageName);
                    return await pluginFactory.create();
                })
        );
    } catch (e) {
        console.error(e);
        return [];
    }
}

/**
 * @param {Partial<import('./types.js').PkgbldPlugin>[]} plugins
 */
export async function runPluginBuildEnd(plugins) {
    await Promise.all(plugins.filter(plugin => plugin.buildEnd).map(plugin => plugin.buildEnd()));
}
