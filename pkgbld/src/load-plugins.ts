import type { PackageJson } from 'type-fest';

export async function loadPlugins(pkg: PackageJson, loaded: Set<string>) {
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
