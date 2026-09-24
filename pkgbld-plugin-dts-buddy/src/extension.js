/**
 * create-pkgbld extension entry for pkgbld-plugin-dts-buddy.
 *
 * pkgbld auto-loads any dep/devDep named `pkgbld-plugin-*`, so installing the
 * package is the entire integration.
 */

export const manifest = {
    name: 'pkgbld-dts-buddy',
    description: 'Generate d.ts files using dts-buddy',
    tags: ['plugin', 'types', 'pkgbld'],
};

export const setup = {
    devDependencies: {
        'pkgbld-plugin-dts-buddy': '^1.0.0',
    },
};

export const remove = {
    devDependencies: ['pkgbld-plugin-dts-buddy'],
};

/**
 * @param {{ readJson(path: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null }} tree
 */
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    if (!pkg) return false;
    return Boolean(pkg.devDependencies?.['pkgbld-plugin-dts-buddy'] || pkg.dependencies?.['pkgbld-plugin-dts-buddy']);
}
