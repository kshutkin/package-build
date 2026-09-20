import { readFileSync } from 'node:fs';
import path from 'node:path';

import semver from 'semver';

import { resolveInstalledPackage } from './package-resolution.js';

/** @param {Record<string, any> | undefined} manifest */
export function getPkgbldPeerRange(manifest) {
    const range = manifest?.peerDependencies?.pkgbld;
    return typeof range === 'string' && range.trim() ? range.trim() : null;
}

/**
 * Inspect an installed plugin without importing it.
 * @param {string} packageName
 * @param {string} projectRoot
 */
export function inspectInstalledPlugin(packageName, projectRoot) {
    const resolved = resolveInstalledPackage(packageName, projectRoot);
    if (!resolved) {
        return {
            eligible: false,
            resolved: null,
            warning: `Ignoring ${packageName}: its installed package metadata cannot be resolved. Install project dependencies before managing it with create-pkgbld.`,
        };
    }
    if (!getPkgbldPeerRange(resolved.manifest)) {
        return {
            eligible: false,
            resolved,
            warning: `Ignoring ${packageName}: the installed package does not declare pkgbld in peerDependencies. Upgrade the plugin before managing it with create-pkgbld.`,
        };
    }
    return { eligible: true, resolved, warning: null };
}

/**
 * Validate a candidate plugin manifest against the target project's PKG BLD.
 * Workspace peer protocols are accepted for local monorepo development; they
 * are converted to normal semver ranges when packages are published.
 * @param {string} packageName
 * @param {Record<string, any> | undefined} manifest
 * @param {string} projectRoot
 */
export function assertPluginCompatible(packageName, manifest, projectRoot) {
    const peerRange = getPkgbldPeerRange(manifest);
    if (!peerRange) {
        throw new Error(`Plugin "${packageName}" does not declare pkgbld in peerDependencies; upgrade it first`);
    }
    if (peerRange.startsWith('workspace:')) return;

    const host = resolveInstalledPackage('pkgbld', projectRoot);
    if (host) {
        if (!semver.satisfies(host.version, peerRange)) {
            throw new Error(`Plugin "${packageName}" requires pkgbld ${peerRange}, but the project resolves ${host.version}`);
        }
        return;
    }

    const declared = readDeclaredPkgbldRange(projectRoot);
    if (!declared) throw new Error(`Plugin "${packageName}" requires pkgbld ${peerRange}, but the project does not declare pkgbld`);
    if (!semver.validRange(declared) || !semver.intersects(declared, peerRange)) {
        throw new Error(`Plugin "${packageName}" requires pkgbld ${peerRange}, but the project declares ${declared}`);
    }
}

/** @param {string} projectRoot */
function readDeclaredPkgbldRange(projectRoot) {
    try {
        const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (typeof pkg[field]?.pkgbld === 'string') return pkg[field].pkgbld;
        }
    } catch {
        // The caller reports the missing host declaration.
    }
    return null;
}
