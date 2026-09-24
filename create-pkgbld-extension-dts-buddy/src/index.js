/** Standalone dts-buddy setup for create-pkgbld. */
export const manifest = {
    name: 'dts-buddy',
    description: 'Standalone d.ts bundling using dts-buddy',
    tags: ['types'],
};

export const setup = {
    devDependencies: {
        'dts-buddy': '^0.8.3',
        typescript: '^6.0.3',
    },
    scripts: {
        'build:types': 'dts-buddy',
    },
};

export const remove = {
    devDependencies: ['dts-buddy'],
    scripts: ['build:types'],
};

/** @param {import('create-pkgbld/src/tree.js').Tree} tree */
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg?.devDependencies?.['dts-buddy'] || pkg?.dependencies?.['dts-buddy']);
}
