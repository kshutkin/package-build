/**
 * create-pkgbld extension entry for pkgbld-plugin-swc.
 *
 * pkgbld auto-loads any dep/devDep named `pkgbld-plugin-*`, so installing the
 * package is the entire integration. Setup adds the devDependency; remove
 * deletes it.
 */

export const manifest = {
    name: 'pkgbld-swc',
    description: 'SWC TypeScript stripping via pkgbld',
    tags: ['plugin', 'typescript', 'pkgbld'],
};

export const setup = {
    devDependencies: {
        'pkgbld-plugin-swc': '^1.0.0',
    },
};

export const remove = {
    devDependencies: ['pkgbld-plugin-swc'],
};

/**
 * @param {{ readJson(path: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null }} tree
 */
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    if (!pkg) return false;
    return Boolean(pkg.devDependencies?.['pkgbld-plugin-swc'] || pkg.dependencies?.['pkgbld-plugin-swc']);
}
