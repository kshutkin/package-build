import { PackageJson } from 'options';
import { PkgbldPlugin } from './types';

export async function loadPlugins(pkg: PackageJson) {
    try {
        return await Promise.all(
            [...new Set([...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})])]
                .filter(packageName => packageName.startsWith('pkgbld-plugin-'))
                .map(packageName => import(packageName))
        ) as Partial<PkgbldPlugin>[];
    } catch (e) {
        console.error(e);
    }
}
