import { access, constants, readFile, stat } from 'node:fs/promises';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import camelCase from 'lodash/camelCase.js';
import { processPackageJson } from 'options';

import { cyan, magenta } from '@niceties/ansi';

/**
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('options').PackageJson} PackageJsonO
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} pkgName
 */
export function getHelpers(pkgName) {
    /**
     * @param {string} anInput
     */
    function getGlobalName(anInput) {
        return camelCase(
            path.join(
                pkgName,
                path.basename(anInput, path.extname(anInput)) !== 'index' ? path.basename(anInput, path.extname(anInput)) : ''
            )
        );
    }

    /**
     * @param {string} id
     */
    function getExternalGlobalName(id) {
        if (path.isAbsolute(id)) {
            return getGlobalName(path.relative(__dirname, id));
        }
        return camelCase(id);
    }

    return {
        getGlobalName,
        getExternalGlobalName,
    };
}

/**
 * @template T
 * @param {T | T[] | undefined} object
 * @returns {T[]}
 */
export function toArray(object) {
    if (Array.isArray(object)) {
        return object;
    }
    if (object == null) {
        return [];
    }
    return [object];
}

/**
 * @param {string[] | string} input
 * @returns {string}
 */
export function formatInput(input) {
    return (Array.isArray(input) ? input : [input ?? '']).map(item => magenta(path.basename(item, path.extname(item)))).join(', ');
}

/**
 * @param {OutputOptions | OutputOptions[] | undefined} output
 * @param {'dir' | 'format'} field
 * @returns {string}
 */
export function formatOutput(output, field) {
    if (output == null) {
        return '';
    }
    return (Array.isArray(output) ? output : [output ?? '']).map(item => cyan(/** @type {string} */ (item[field]))).join(', ');
}

/**
 * @param {number} starting
 * @returns {string}
 */
export function getTimeDiff(starting) {
    const diff = Date.now() - starting;
    return diff >= 1000 ? `${(diff / 1000).toFixed(1)}s` : `${diff}ms`;
}

/**
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {boolean}
 */
export const areSetsEqual = (a, b) => (a.size === b.size ? [...a].every(value => b.has(value)) : false);

/**
 * @param {PackageJson} pkg
 * @returns {PackageJson}
 */
export function formatPackageJson(pkg) {
    return /** @type {PackageJson} */ (
        processPackageJson(
            /** @type {PackageJsonO} */ (pkg),
            key => key in pkg,
            key => /** @type {Record<string, unknown>} */ (pkg)[key]
        )
    );
}

/**
 * @param {string} file
 * @returns {Promise<string | false>}
 */
export async function isExists(file) {
    try {
        await access(file);
    } catch (e) {
        if (typeof e === 'object' && e != null && 'code' in e && e.code === 'ENOENT') {
            return /** @type {const} */ (false);
        }
        throw e;
    }
    return file;
}

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function isReadable(file) {
    try {
        await stat(file);
    } catch {
        return false;
    }
    try {
        await access(file, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} root
 * @param {string} file
 */
function hasFile(root, file) {
    const path = join(root, file);
    return isExists(path);
}

/**
 * @param {string} root
 * @returns {Promise<boolean>}
 */
async function hasWorkspacePackageJson(root) {
    const path = join(root, 'package.json');
    if (!(await isReadable(path))) {
        return false;
    }
    try {
        const content = /** @type {PackageJson} */ (JSON.parse(await readFile(path, 'utf-8')) || {});
        return !!content.workspaces;
    } catch {
        return false;
    }
}

/**
 * @param {string} current
 * @returns {Promise<string>}
 */
export async function searchForPackageRoot(current) {
    const root = current;
    let dir = current;

    while (dir) {
        if (await hasFile(dir, 'package.json')) return dir;

        const parentDir = dirname(dir);
        if (parentDir === dir) break;

        dir = parentDir;
    }

    return root;
}

/**
 * @param {string} current
 * @returns {Promise<string>}
 */
export async function searchForWorkspaceRoot(current) {
    const root = await searchForPackageRoot(current);
    let dir = current;

    while (dir) {
        if (await hasFile(dir, 'pnpm-workspace.yaml')) return dir;
        if (await hasWorkspacePackageJson(dir)) return dir;

        const parentDir = dirname(dir);
        if (parentDir === dir) break;

        dir = parentDir;
    }

    return root;
}
