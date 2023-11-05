import { PackageJson } from 'options';
import { PkgbldPlugin } from './types';

export function loadPlugins(pkg: PackageJson) { 
    return Promise.all(
        Object.keys(pkg.devDependencies || {})
            .filter(packageName => packageName.startsWith('pkgbld-plugin-'))
            .map(packageName => import(packageName))
    ) as Promise<Partial<PkgbldPlugin>[]>;
}
