/**
 * create-pkgbld extension that wires Biome into a project.
 *
 * NOTE: Biome is a linter/formatter, not a rollup plugin. This package is
 * referenced by the create-pkgbld registry and only ever installed as a
 * devDependency of the extension system itself. The user project only gets
 * `@biomejs/biome` (see `setup.devDependencies` below).
 */

export const manifest = {
    name: 'biome',
    description: 'Biome linter and formatter',
    tags: ['linter', 'formatter'],
};

export const setup = {
    devDependencies: {
        '@biomejs/biome': '^2.3.8',
    },
    scripts: {
        lint: 'biome check ./src',
        'lint:fix': 'biome check --fix ./src',
    },
    files: {
        'biome.json': './templates/biome.tpl.json',
    },
};

export const remove = {
    devDependencies: ['@biomejs/biome'],
    scripts: ['lint', 'lint:fix'],
    files: ['biome.json'],
};

/**
 * @param {import('create-pkgbld/src/tree.js').Tree} tree
 */
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    if (pkg && (pkg.devDependencies?.['@biomejs/biome'] || pkg.dependencies?.['@biomejs/biome'])) return true;
    return tree.exists('biome.json');
}
