import { PackageJson } from 'type-fest';
import { PkgbldPluginFactory } from './types';

export async function loadPlugins(pkg: PackageJson) {
    try {
        return await Promise.all(
            [...new Set([...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})])]
                .filter(packageName => packageName.startsWith('pkgbld-plugin-'))
                .map(packageName => import(packageName).then((pluginFactory: PkgbldPluginFactory) => pluginFactory.create()))
        );
    } catch (e) {
        console.error(e);
        return [];
    }
}
