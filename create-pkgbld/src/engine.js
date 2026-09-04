import { readFileSync } from 'node:fs';

/**
 * @typedef {import('./tree.js').Tree} Tree
 * @typedef {import('./registry.js').Extension} Extension
 * @typedef {import('./registry.js').SetupDeclarative} SetupDeclarative
 * @typedef {import('./registry.js').RemoveDeclarative} RemoveDeclarative
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 */

/**
 * Run an extension's setup against the given tree.
 *
 * @param {Extension} extension
 * @param {Tree} tree
 * @param {OptionsValue} [options]
 */
export async function runSetup(extension, tree, options = {}) {
    if (!extension.setup) return;
    tree.setExtensionBase(extension.__baseDir ?? null);
    try {
        if (typeof extension.setup === 'function') {
            await extension.setup(tree, options);
        } else {
            applyDeclarativeSetup(extension.setup, tree);
        }
    } finally {
        tree.setExtensionBase(null);
    }
}

/**
 * Run an extension's remove against the given tree.
 *
 * @param {Extension} extension
 * @param {Tree} tree
 * @param {OptionsValue} [options]
 */
export async function runRemove(extension, tree, options = {}) {
    if (!extension.remove) return;
    tree.setExtensionBase(extension.__baseDir ?? null);
    try {
        if (typeof extension.remove === 'function') {
            await extension.remove(tree, options);
        } else {
            applyDeclarativeRemove(extension.remove, tree);
        }
    } finally {
        tree.setExtensionBase(null);
    }
}

/**
 * @param {Extension} extension
 * @param {Tree} tree
 */
export function detectExtension(extension, tree) {
    if (typeof extension.detect !== 'function') return false;
    return Boolean(extension.detect(tree));
}

/**
 * @param {SetupDeclarative} setup
 * @param {Tree} tree
 */
function applyDeclarativeSetup(setup, tree) {
    if (setup.dependencies) {
        for (const [name, version] of Object.entries(setup.dependencies)) {
            tree.addDependency(name, version, 'dependencies');
        }
    }
    if (setup.devDependencies) {
        for (const [name, version] of Object.entries(setup.devDependencies)) {
            tree.addDependency(name, version, 'devDependencies');
        }
    }
    if (setup.scripts) {
        for (const [name, command] of Object.entries(setup.scripts)) {
            tree.addScript(name, command);
        }
    }
    if (setup.files) {
        for (const [target, source] of Object.entries(setup.files)) {
            if (source.startsWith('inline:')) {
                tree.write(target, source.slice('inline:'.length));
            } else {
                const abs = tree.resolveExtensionFile(source);
                tree.write(target, readFileSync(abs, 'utf8'));
            }
        }
    }
    if (setup.packageJson) {
        const extra = setup.packageJson;
        tree.updateJson('package.json', pkg => {
            for (const [key, value] of Object.entries(extra)) {
                pkg[key] = value;
            }
            return pkg;
        });
    }
}

/**
 * @param {RemoveDeclarative} remove
 * @param {Tree} tree
 */
function applyDeclarativeRemove(remove, tree) {
    if (remove.dependencies) {
        for (const name of remove.dependencies) tree.removeDependency(name, 'dependencies');
    }
    if (remove.devDependencies) {
        for (const name of remove.devDependencies) tree.removeDependency(name, 'devDependencies');
    }
    if (remove.scripts) {
        for (const name of remove.scripts) tree.removeScript(name);
    }
    if (remove.files) {
        for (const file of remove.files) tree.delete(file);
    }
}
