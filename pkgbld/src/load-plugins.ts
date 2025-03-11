import type { PackageJson } from 'type-fest';
import type { PkgbldPluginFactory } from './types';

export async function loadPlugins(pkg: PackageJson, loaded: Set<string>) {
    try {
        return await Promise.all(
            [...new Set([...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})])]
                .filter(packageName => packageName.startsWith('pkgbld-plugin-') && !loaded.has(packageName))
                .map(packageName => {
                    loaded.add(packageName);
                    return import(packageName).then((pluginFactory: PkgbldPluginFactory) => pluginFactory.create());
                })
        );
    } catch (e) {
        console.error(e);
        return [];
    }
}
