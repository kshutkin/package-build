import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getExtensionCacheDir, getPackageName, installCachedExtension } from './extension-cache.js';

/**
 * @typedef {{ name: string, package: string, version?: string, description: string, tags?: string[], official?: boolean }} ExtensionEntry
 * @typedef {import('./tree.js').Tree} Tree
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 *
 * @typedef {{
 *   dependencies?: Record<string, string>,
 *   devDependencies?: Record<string, string>,
 *   scripts?: Record<string, string>,
 *   files?: Record<string, string>,
 *   packageJson?: Record<string, unknown>
 * }} SetupDeclarative
 *
 * @typedef {{
 *   dependencies?: string[],
 *   devDependencies?: string[],
 *   scripts?: string[],
 *   files?: string[]
 * }} RemoveDeclarative
 *
 * @typedef {{
 *   manifest: { name: string, description: string, tags?: string[] },
 *   setup?: SetupDeclarative | ((tree: Tree, options: OptionsValue) => Promise<void>),
 *   remove?: RemoveDeclarative | ((tree: Tree, options: OptionsValue) => Promise<void>),
 *   detect?: (tree: Tree) => boolean,
 *   prompts?: (tree: Tree) => Option[],
 *   __baseDir?: string
 * }} Extension
 */

/**
 * Load and merge built-in + optional local registries.
 * Local entries win on `name` collision.
 *
 * @param {string} builtinPath - absolute path to the built-in registry JSON
 * @param {string} projectRoot - project root that may contain `.pkgbld-extensions.json`
 * @param {boolean} [builtinOfficial] - whether the primary registry is maintained by create-pkgbld
 * @returns {Promise<ExtensionEntry[]>}
 */
export async function loadRegistry(builtinPath, projectRoot, builtinOfficial = true) {
    const builtin = await readRegistryFile(builtinPath);
    const localPath = path.join(projectRoot, '.pkgbld-extensions.json');
    const local = await readRegistryFile(localPath, true);

    /** @type {Map<string, ExtensionEntry>} */
    const byName = new Map();
    for (const entry of builtin) byName.set(entry.name, { ...entry, official: builtinOfficial });
    for (const entry of local) byName.set(entry.name, { ...entry, official: false });
    return [...byName.values()];
}

/**
 * @param {string} file
 * @param {boolean} [optional]
 * @returns {Promise<ExtensionEntry[]>}
 */
async function readRegistryFile(file, optional = false) {
    let raw;
    try {
        raw = await readFile(file, 'utf8');
    } catch (/** @type {any} */ err) {
        if (optional && err.code === 'ENOENT') return [];
        throw err;
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.extensions)) {
        throw new Error(`Invalid registry file ${file}: missing "extensions" array`);
    }
    return data.extensions;
}

/**
 * Dynamically import an extension package and normalize its named exports
 * into an Extension object. Resolution prefers the project's node_modules
 * before create-pkgbld's own resolution.
 *
 * @param {ExtensionEntry} entry
 * @param {string} projectRoot
 * @param {{ install?: boolean }} [options]
 * @returns {Promise<Extension>}
 */
export async function resolveExtension(entry, projectRoot, options = {}) {
    const specifier = entry.package;
    let resolved;
    const projectManifest = path.join(projectRoot, 'package.json');
    try {
        resolved = createRequire(projectManifest).resolve(specifier);
    } catch {
        // Fall back to the shared cache and create-pkgbld's dependencies.
    }

    if (!resolved && options.install && entry.official && getPackageName(specifier)) {
        await installCachedExtension(entry);
    }

    for (const root of [path.join(getExtensionCacheDir(), 'package.json'), import.meta.url]) {
        if (resolved) break;
        try {
            resolved = createRequire(root).resolve(specifier);
        } catch {
            // Try the next resolution root.
        }
    }
    if (!resolved) {
        const hint = entry.official && getPackageName(specifier) ? ' Select it to download it to the shared cache.' : '';
        throw new Error(`Cannot resolve extension package "${specifier}" for "${entry.name}".${hint}`);
    }

    const mod = await import(resolved);
    const ext = normalizeModule(mod);
    ext.__baseDir = path.dirname(resolved);
    if (!ext.manifest) {
        throw new Error(`Extension "${entry.name}" (${specifier}) does not export a "manifest"`);
    }
    return ext;
}

/**
 * @param {any} mod
 * @returns {Extension}
 */
function normalizeModule(mod) {
    const source = mod && typeof mod === 'object' && mod.default && typeof mod.default === 'object' ? { ...mod.default, ...mod } : mod;
    return {
        manifest: source.manifest,
        setup: source.setup,
        remove: source.remove,
        detect: source.detect,
        prompts: source.prompts,
    };
}
