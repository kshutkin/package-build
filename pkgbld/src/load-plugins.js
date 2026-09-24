import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 */

import { isPluginPackageName } from './plugin-name.js';

/**
 * @param {PackageJson} pkg
 * @param {Set<string>} loaded
 * @param {string} packageJsonPath
 */
export async function loadPlugins(pkg, loaded, packageJsonPath) {
    const resolveFromPackage = createRequire(packageJsonPath).resolve;
    return await Promise.all(
        [
            ...new Set([
                ...Object.keys(pkg.devDependencies || {}),
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.peerDependencies || {}),
            ]),
        ]
            .filter(packageName => isPluginPackageName(packageName) && !loaded.has(packageName))
            .map(async packageName => {
                loaded.add(packageName);
                try {
                    const pluginPath = resolveFromPackage(packageName);
                    const pluginFactory = await import(pathToFileURL(pluginPath).href);
                    return await pluginFactory.create();
                } catch (cause) {
                    throw new Error(`Failed to load Build plugin ${JSON.stringify(packageName)} from ${packageJsonPath}`, { cause });
                }
            })
    );
}
