import { runRemove, runSetup } from './engine.js';
import { resolveInstalledPackage } from './package-resolution.js';
import { removeLockedPackage, setLockedPackage } from './project-lock.js';
import { resolveExtension } from './registry.js';

/**
 * Resolve extension behavior on demand. Locked entries always request their exact version.
 * @param {import('./inventory.js').PackageItem} item
 * @param {string} projectRoot
 */
export async function ensurePackageExtension(item, projectRoot) {
    if (!item.hasExtensionContract) throw new Error(`Package "${item.packageName}" does not provide create-pkgbld extension behavior`);
    if (item.ext && (!item.lockedVersion || item.ext.__packageVersion === item.lockedVersion)) return item.ext;
    const entry = item.lockedVersion ? { ...item.entry, version: item.lockedVersion, official: true } : item.entry;
    const ext = await resolveExtension(entry, projectRoot, { install: true, exactVersion: item.lockedVersion ?? undefined });
    item.ext = ext;
    item.error = null;
    item.resolvedVersion = ext.__packageVersion ?? item.resolvedVersion;
    return ext;
}

/**
 * Apply setup, adoption, or removal and stage the matching lock mutation in the same Tree.
 * @param {import('./inventory.js').PackageItem} item
 * @param {import('./tree.js').Tree} tree
 * @param {string} projectRoot
 */
export async function applyPackageIntent(item, tree, projectRoot) {
    if (!item.intent) return;
    if (item.intent === 'adopt') {
        const version = item.resolvedVersion ?? resolveInstalledPackage(item.packageName, projectRoot)?.version;
        if (!version) {
            throw new Error(`Cannot adopt "${item.packageName}": install project dependencies first so its exact version can be resolved`);
        }
        setLockedPackage(tree, item.packageName, version);
        return;
    }

    if (item.intent === 'setup') {
        if (!item.hasExtensionContract && item.kind === 'plugin' && item.lockedVersion) {
            tree.addDependency(item.packageName, item.lockedVersion, 'devDependencies');
            setLockedPackage(tree, item.packageName, item.lockedVersion);
            return;
        }
        const ext = await ensurePackageExtension(item, projectRoot);
        await runSetup(ext, tree, item.options);
        const version = ext.__packageVersion;
        if (!version) throw new Error(`Cannot lock "${item.packageName}": its exact package version could not be resolved`);
        setLockedPackage(tree, item.packageName, version);
        return;
    }

    if (item.ext) {
        await runRemove(item.ext, tree, item.options);
    } else if (item.hasExtensionContract) {
        const ext = await ensurePackageExtension(item, projectRoot);
        await runRemove(ext, tree, item.options);
    }
    if (item.kind === 'plugin') removePluginDependencies(tree, item.packageName);
    removeLockedPackage(tree, item.packageName);
}

/** @param {import('./tree.js').Tree} tree @param {string} packageName */
export function removePluginDependencies(tree, packageName) {
    tree.updateJson('package.json', pkg => {
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (!pkg[field] || !(packageName in pkg[field])) continue;
            delete pkg[field][packageName];
            if (Object.keys(pkg[field]).length === 0) delete pkg[field];
        }
        return pkg;
    });
}
