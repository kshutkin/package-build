import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { detectExtension } from './engine.js';
import { getPackageName } from './extension-cache.js';
import { getPackageKind, isPluginPackageName } from './package-names.js';
import { getPkgbldPeerRange, inspectInstalledPlugin } from './plugin-compatibility.js';
import { resolveInstalledPackage } from './package-resolution.js';
import { readProjectLock } from './project-lock.js';
import { resolveExtension } from './registry.js';
import { Tree } from './tree.js';

/**
 * @typedef {'available' | 'applied' | 'installed-managed' | 'installed-unmanaged' | 'unavailable'} PackageState
 * @typedef {{
 *   entry: import('./registry.js').ExtensionEntry,
 *   packageName: string,
 *   kind: 'plugin' | 'extension',
 *   state: PackageState,
 *   lockedVersion: string | null,
 *   resolvedVersion: string | null,
 *   dependencyFields: string[],
 *   hasExtensionContract: boolean,
 *   ext: import('./registry.js').Extension | null,
 *   error: string | null,
 *   installed: boolean,
 *   managed: boolean
 * }} PackageItem
 */

/**
 * Build the package inventory without downloading or executing missing packages.
 * @param {import('./registry.js').ExtensionEntry[]} registry
 * @param {string} projectRoot
 * @returns {Promise<{ items: PackageItem[], warnings: string[] }>}
 */
export async function buildPackageInventory(registry, projectRoot) {
    const lock = await readProjectLock(projectRoot);
    const pkg = await readPackageJson(projectRoot);
    /** @type {Map<string, { entry: import('./registry.js').ExtensionEntry, packageName: string, kind: 'plugin' | 'extension', lockedVersion: string | null, dependencyFields: string[], hasExtensionContract: boolean }>} */
    const records = new Map();

    for (const entry of registry) {
        const packageName = getPackageName(entry.package);
        const kind = packageName && getPackageKind(packageName);
        if (!packageName || !kind) throw new Error(`Registry package "${entry.package}" does not use a supported package name`);
        records.set(packageName, {
            entry,
            packageName,
            kind,
            lockedVersion: lock?.packages[packageName] ?? null,
            dependencyFields: getDependencyFields(pkg, packageName),
            hasExtensionContract: true,
        });
    }

    for (const [packageName, version] of Object.entries(lock?.packages ?? {})) {
        if (records.has(packageName)) continue;
        const kind = /** @type {'plugin' | 'extension'} */ (getPackageKind(packageName));
        records.set(packageName, {
            entry: {
                name: packageName,
                package: packageName,
                version,
                description: kind === 'plugin' ? 'Third-party PKG BLD plugin' : 'PKG BLD extension',
                tags: kind === 'plugin' ? ['plugin', 'pkgbld', 'third-party'] : ['extension', 'third-party'],
                official: false,
            },
            packageName,
            kind,
            lockedVersion: version,
            dependencyFields: getDependencyFields(pkg, packageName),
            hasExtensionContract: kind === 'extension',
        });
    }

    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const packageName of Object.keys(pkg[field] ?? {})) {
            if (!isPluginPackageName(packageName) || records.has(packageName)) continue;
            records.set(packageName, {
                entry: {
                    name: packageName,
                    package: packageName,
                    description: 'Third-party PKG BLD plugin',
                    tags: ['plugin', 'pkgbld', 'third-party'],
                    official: false,
                },
                packageName,
                kind: 'plugin',
                lockedVersion: null,
                dependencyFields: getDependencyFields(pkg, packageName),
                hasExtensionContract: false,
            });
        }
    }

    const tree = new Tree(projectRoot);
    /** @type {PackageItem[]} */
    const items = [];
    /** @type {string[]} */
    const warnings = [];
    for (const record of records.values()) {
        let installedPackage = resolveInstalledPackage(record.packageName, projectRoot);
        if (record.kind === 'plugin' && record.dependencyFields.length > 0) {
            const inspection = inspectInstalledPlugin(record.packageName, projectRoot);
            if (!inspection.eligible) {
                warnings.push(/** @type {string} */ (inspection.warning));
                continue;
            }
            installedPackage = inspection.resolved;
        } else if (record.kind === 'plugin' && record.lockedVersion && !record.entry.official) {
            warnings.push(
                `Ignoring ${record.packageName}: its plugin metadata cannot be verified from the project. Install and adopt a modern version before managing it with create-pkgbld.`
            );
            continue;
        }
        let ext = null;
        let error = null;
        let detected = false;
        let resolvedVersion = installedPackage?.version ?? null;
        if (record.hasExtensionContract && record.entry.official) {
            try {
                ext = await resolveExtension(record.entry, projectRoot, { exactVersion: record.lockedVersion ?? undefined });
                if (record.kind === 'plugin' && !getPkgbldPeerRange(ext.__packageManifest)) {
                    warnings.push(
                        `Ignoring ${record.packageName}: the resolved package does not declare pkgbld in peerDependencies. Upgrade the plugin before managing it with create-pkgbld.`
                    );
                    continue;
                }
                detected = detectExtension(ext, tree);
                resolvedVersion = ext.__packageVersion ?? resolvedVersion;
            } catch (/** @type {any} */ cause) {
                error = cause.message ?? String(cause);
            }
        }
        const installed = record.kind === 'plugin' ? record.dependencyFields.length > 0 : detected;
        const managed = record.lockedVersion !== null;
        /** @type {PackageState} */
        let state;
        if (managed) state = installed ? 'installed-managed' : 'applied';
        else if (installed) state = 'installed-unmanaged';
        else if (record.entry.official) state = 'available';
        else state = 'unavailable';
        items.push({ ...record, state, resolvedVersion, ext, error, installed, managed });
    }
    return { items: items.sort((a, b) => a.entry.name.localeCompare(b.entry.name)), warnings };
}

/** @param {Record<string, any>} pkg @param {string} packageName */
function getDependencyFields(pkg, packageName) {
    return ['dependencies', 'devDependencies', 'peerDependencies'].filter(field => pkg[field]?.[packageName] !== undefined);
}

/** @param {string} projectRoot */
async function readPackageJson(projectRoot) {
    try {
        return JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
    } catch {
        return {};
    }
}
