import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { toFormattedJson } from 'pkgbld/options';

import { isLockPackageName } from './package-names.js';

export const LOCK_FILE = '.pkgbld-lock.json';
export const LOCK_SCHEMA = 'https://unpkg.com/create-pkgbld/lock-schema-v1.json';
const EXACT_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** @typedef {{ $schema: string, packages: Record<string, string> }} ProjectLock */

/** @param {string} projectRoot @returns {Promise<ProjectLock | null>} */
export async function readProjectLock(projectRoot) {
    let value;
    try {
        value = JSON.parse(await readFile(path.join(projectRoot, LOCK_FILE), 'utf8'));
    } catch (/** @type {any} */ error) {
        if (error.code === 'ENOENT') return null;
        throw new Error(`Cannot read ${LOCK_FILE}: ${error.message}`);
    }
    validateProjectLock(value);
    return value;
}

/** @param {unknown} value */
export function validateProjectLock(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${LOCK_FILE}: expected an object`);
    const lock = /** @type {Record<string, any>} */ (value);
    if (lock.$schema !== LOCK_SCHEMA) throw new Error(`Invalid ${LOCK_FILE}: unsupported $schema`);
    if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
        throw new Error(`Invalid ${LOCK_FILE}: expected a packages object`);
    }
    const extra = Object.keys(lock).filter(key => key !== '$schema' && key !== 'packages');
    if (extra.length > 0) throw new Error(`Invalid ${LOCK_FILE}: unexpected property "${extra[0]}"`);
    for (const [packageName, version] of Object.entries(lock.packages)) {
        if (!isLockPackageName(packageName)) throw new Error(`Invalid ${LOCK_FILE}: unsupported package name "${packageName}"`);
        if (typeof version !== 'string' || !EXACT_VERSION_RE.test(version)) {
            throw new Error(`Invalid ${LOCK_FILE}: "${packageName}" must use an exact version`);
        }
    }
}

/** @param {import('./tree.js').Tree} tree @returns {ProjectLock | null} */
export function readProjectLockFromTree(tree) {
    const value = tree.readJson(LOCK_FILE);
    if (value === null) return null;
    validateProjectLock(value);
    return value;
}

/** @param {import('./tree.js').Tree} tree @param {Record<string, string>} packages */
export function writeProjectLock(tree, packages) {
    const sorted = Object.fromEntries(Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    tree.write(LOCK_FILE, toFormattedJson({ $schema: LOCK_SCHEMA, packages: sorted }, tree.read(LOCK_FILE)));
}

/** @param {import('./tree.js').Tree} tree @param {string} packageName @param {string} version */
export function setLockedPackage(tree, packageName, version) {
    if (!isLockPackageName(packageName)) throw new Error(`Cannot lock unsupported package name "${packageName}"`);
    if (!EXACT_VERSION_RE.test(version)) throw new Error(`Cannot lock "${packageName}": version "${version}" is not exact`);
    const lock = readProjectLockFromTree(tree) ?? { $schema: LOCK_SCHEMA, packages: {} };
    writeProjectLock(tree, { ...lock.packages, [packageName]: version });
}

/** @param {import('./tree.js').Tree} tree @param {string} packageName */
export function removeLockedPackage(tree, packageName) {
    const lock = readProjectLockFromTree(tree);
    if (!lock || !(packageName in lock.packages)) return;
    const packages = { ...lock.packages };
    delete packages[packageName];
    writeProjectLock(tree, packages);
}
