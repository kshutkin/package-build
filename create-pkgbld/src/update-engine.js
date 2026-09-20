import { readFileSync } from 'node:fs';
import path from 'node:path';

const ABSENT = Symbol('absent');

/**
 * Apply target-version update behavior or guarded declarative reconciliation.
 * @param {{
 *   previous: import('./registry.js').Extension,
 *   target: import('./registry.js').Extension,
 *   tree: import('./tree.js').Tree,
 *   fromVersion: string,
 *   toVersion: string,
 *   options?: import('./types.js').OptionsValue,
 *   exclude?: string[],
 *   reportConflict(conflict: { resource: string, message: string, expected?: unknown, current?: unknown, proposed?: unknown }): void
 * }} params
 */
export async function runExtensionUpdate({ previous, target, tree, fromVersion, toVersion, options = {}, exclude = [], reportConflict }) {
    const reconcileDeclarative = (/** @type {{ exclude?: string[] }} */ reconcileOptions = {}) => {
        if (!isDeclarative(previous.setup) || !isDeclarative(target.setup)) {
            throw new Error('Declarative reconciliation requires declarative setup in both package versions');
        }
        reconcileSetups(previous, target, tree, reportConflict, [...exclude, ...(reconcileOptions.exclude ?? [])]);
    };

    if (typeof target.update === 'function') {
        tree.setExtensionBase(target.__baseDir ?? null);
        try {
            await target.update(tree, Object.freeze({ fromVersion, toVersion, reconcileDeclarative, reportConflict }), options);
        } finally {
            tree.setExtensionBase(null);
        }
        return;
    }

    if (!isDeclarative(previous.setup) || !isDeclarative(target.setup)) {
        throw new Error(`Update from ${fromVersion} to ${toVersion} is unsupported: the target has no update function`);
    }
    reconcileDeclarative();
}

/** @param {unknown} setup */
function isDeclarative(setup) {
    return Boolean(setup && typeof setup === 'object' && !Array.isArray(setup));
}

/**
 * @param {import('./registry.js').Extension} previous
 * @param {import('./registry.js').Extension} target
 * @param {import('./tree.js').Tree} tree
 * @param {(conflict: any) => void} reportConflict
 * @param {string[]} excluded
 */
function reconcileSetups(previous, target, tree, reportConflict, excluded) {
    const oldResources = collectResources(/** @type {import('./registry.js').SetupDeclarative} */ (previous.setup), previous);
    const newResources = collectResources(/** @type {import('./registry.js').SetupDeclarative} */ (target.setup), target);
    const excludedSet = new Set(excluded);
    const keys = new Set([...oldResources.keys(), ...newResources.keys()]);

    for (const key of [...keys].sort()) {
        if (excludedSet.has(key)) continue;
        const oldResource = oldResources.get(key);
        const newResource = newResources.get(key);
        const resource = newResource ?? oldResource;
        if (!resource) continue;
        const oldValue = oldResource?.value ?? ABSENT;
        const newValue = newResource?.value ?? ABSENT;
        const currentValue = readCurrent(resource, tree);

        if (sameValue(currentValue, oldValue, resource) || sameValue(currentValue, newValue, resource)) {
            if (!sameValue(currentValue, newValue, resource)) applyValue(resource, newValue, tree);
            continue;
        }
        if (sameValue(oldValue, newValue, resource)) continue;

        reportConflict({
            resource: key,
            expected: externalValue(oldValue),
            current: externalValue(currentValue),
            proposed: externalValue(newValue),
            message: `Resource "${displayResource(resource)}" was changed after the previous package version was applied`,
        });
        applyValue(resource, newValue, tree);
    }
}

/** @param {import('./registry.js').SetupDeclarative} setup @param {import('./registry.js').Extension} extension */
function collectResources(setup, extension) {
    /** @type {Map<string, any>} */
    const resources = new Map();
    for (const [name, value] of Object.entries(setup.dependencies ?? {})) {
        resources.set(`dependency:dependencies:${name}`, { kind: 'dependency', field: 'dependencies', name, value });
    }
    for (const [name, value] of Object.entries(setup.devDependencies ?? {})) {
        resources.set(`dependency:devDependencies:${name}`, { kind: 'dependency', field: 'devDependencies', name, value });
    }
    for (const [name, value] of Object.entries(setup.scripts ?? {})) {
        resources.set(`script:${name}`, { kind: 'script', name, value });
    }
    for (const [target, source] of Object.entries(setup.files ?? {})) {
        const value = source.startsWith('inline:')
            ? source.slice('inline:'.length)
            : readFileSync(resolveExtensionFile(extension, source), 'utf8');
        resources.set(`file:${target}`, { kind: 'file', path: target, value });
    }
    for (const [name, value] of Object.entries(setup.packageJson ?? {})) {
        resources.set(`package-json:${name}`, { kind: 'package-json', name, value });
    }
    return resources;
}

/** @param {import('./registry.js').Extension} extension @param {string} relativePath */
function resolveExtensionFile(extension, relativePath) {
    if (!extension.__baseDir) throw new Error(`Cannot resolve extension file "${relativePath}": package base is unavailable`);
    return path.resolve(extension.__baseDir, relativePath);
}

/** @param {any} resource @param {import('./tree.js').Tree} tree */
function readCurrent(resource, tree) {
    if (resource.kind === 'file') return tree.read(resource.path) ?? ABSENT;
    const pkg = tree.readJson('package.json') ?? {};
    if (resource.kind === 'dependency') return pkg[resource.field]?.[resource.name] ?? ABSENT;
    if (resource.kind === 'script') return pkg.scripts?.[resource.name] ?? ABSENT;
    return pkg[resource.name] ?? ABSENT;
}

/** @param {any} resource @param {unknown} value @param {import('./tree.js').Tree} tree */
function applyValue(resource, value, tree) {
    if (resource.kind === 'file') {
        if (value === ABSENT) tree.delete(resource.path);
        else tree.write(resource.path, /** @type {string} */ (value));
        return;
    }
    tree.updateJson('package.json', pkg => {
        const container = resource.kind === 'dependency' ? resource.field : resource.kind === 'script' ? 'scripts' : null;
        if (container) {
            if (value === ABSENT) {
                if (pkg[container]) {
                    delete pkg[container][resource.name];
                    if (Object.keys(pkg[container]).length === 0) delete pkg[container];
                }
            } else {
                pkg[container] ??= {};
                pkg[container][resource.name] = value;
            }
        } else if (value === ABSENT) {
            delete pkg[resource.name];
        } else {
            pkg[resource.name] = value;
        }
        return pkg;
    });
}

/** @param {unknown} left @param {unknown} right @param {any} resource */
function sameValue(left, right, resource) {
    if (left === ABSENT || right === ABSENT) return left === right;
    if (resource.kind === 'file' && resource.path.endsWith('.json')) {
        try {
            return fingerprint(JSON.parse(/** @type {string} */ (left))) === fingerprint(JSON.parse(/** @type {string} */ (right)));
        } catch {
            return left === right;
        }
    }
    return fingerprint(left) === fingerprint(right);
}

/** @param {unknown} value */
function fingerprint(value) {
    return JSON.stringify(canonicalize(value));
}

/** @param {unknown} value @returns {unknown} */
function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(/** @type {Record<string, unknown>} */ (value))
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)])
    );
}

/** @param {unknown} value */
function externalValue(value) {
    return value === ABSENT ? undefined : value;
}

/** @param {any} resource */
function displayResource(resource) {
    if (resource.kind === 'file') return resource.path;
    if (resource.kind === 'dependency') return `${resource.field}.${resource.name}`;
    if (resource.kind === 'script') return `scripts.${resource.name}`;
    return `package.json:${resource.name}`;
}
