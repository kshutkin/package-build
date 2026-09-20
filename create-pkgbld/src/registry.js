import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import semver from 'semver';

import {
    getExtensionCacheDir,
    getExtensionCacheSlot,
    getPackageName,
    installCachedExtension,
    listCachedExtensionSlots,
} from './extension-cache.js';
import { readResolvedPackage } from './package-resolution.js';

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
 *   update?: (tree: Tree, context: any, options: OptionsValue) => Promise<void>,
 *   detect?: (tree: Tree) => boolean,
 *   prompts?: (tree: Tree, context?: any) => Option[],
 *   __baseDir?: string,
 *   __packageVersion?: string,
 *   __packageManifest?: Record<string, any>
 * }} Extension
 */

/**
 * Load a registry file.
 *
 * @param {string} builtinPath - absolute path to the built-in registry JSON
 * @param {boolean} [builtinOfficial] - whether the primary registry is maintained by create-pkgbld
 * @returns {Promise<ExtensionEntry[]>}
 */
export async function loadRegistry(builtinPath, builtinOfficial = true) {
    const builtin = await readRegistryFile(builtinPath);
    return builtin.map(entry => ({ ...entry, official: builtinOfficial }));
}

/**
 * @param {string} file
 * @returns {Promise<ExtensionEntry[]>}
 */
async function readRegistryFile(file) {
    const raw = await readFile(file, 'utf8');
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
 * @param {{ install?: boolean, exactVersion?: string, resolveVersion?: (packageName: string, selector: string) => Promise<string> }} [options]
 * @returns {Promise<Extension>}
 */
export async function resolveExtension(entry, projectRoot, options = {}) {
    const specifier = entry.package;
    const packageName = getPackageName(specifier);
    let resolved;
    const projectManifest = path.join(projectRoot, 'package.json');
    try {
        resolved = createRequire(projectManifest).resolve(specifier);
        if (!hasExpectedVersion(resolved, packageName, options.exactVersion, entry.version)) resolved = undefined;
    } catch {
        // Fall back to the shared cache and create-pkgbld's dependencies.
    }

    if (!resolved && packageName) {
        const slots = options.exactVersion
            ? [{ cacheDir: getExtensionCacheSlot(packageName, options.exactVersion), version: options.exactVersion }]
            : await listCachedExtensionSlots(packageName, entry.version);
        for (const slot of slots) {
            try {
                resolved = createRequire(path.join(slot.cacheDir, 'package.json')).resolve(specifier);
                if (hasExpectedVersion(resolved, packageName, options.exactVersion, entry.version)) break;
                resolved = undefined;
            } catch {
                // Try the next cached exact version.
            }
        }
    }

    // Read caches created by the pre-versioned layout. New installations are
    // always written to exact-version slots.
    if (!resolved && packageName) {
        try {
            resolved = createRequire(path.join(getExtensionCacheDir(), 'package.json')).resolve(specifier);
            if (!hasExpectedVersion(resolved, packageName, options.exactVersion, entry.version)) resolved = undefined;
        } catch {
            // Continue to bundled resolution or installation.
        }
    }

    if (!resolved) {
        try {
            resolved = createRequire(import.meta.url).resolve(specifier);
            if (!hasExpectedVersion(resolved, packageName, options.exactVersion, entry.version)) resolved = undefined;
        } catch {
            // Installation may provide the package below.
        }
    }

    if (!resolved && options.install && entry.official && packageName) {
        const installed = await installCachedExtension(
            { ...entry, version: options.exactVersion ?? entry.version },
            getExtensionCacheDir(),
            undefined,
            options.resolveVersion
        );
        resolved = createRequire(path.join(installed.cacheDir, 'package.json')).resolve(specifier);
    }
    if (!resolved) {
        const hint = entry.official && packageName ? ' Select it to download it to the shared cache.' : '';
        throw new Error(`Cannot resolve extension package "${specifier}" for "${entry.name}".${hint}`);
    }

    const mod = await import(resolved);
    const ext = normalizeModule(mod);
    ext.__baseDir = path.dirname(resolved);
    if (packageName) {
        const pkg = readResolvedPackage(resolved, packageName);
        ext.__packageVersion = pkg?.version;
        ext.__packageManifest = pkg?.manifest;
    }
    if (!ext.manifest) {
        throw new Error(`Extension "${entry.name}" (${specifier}) does not export a "manifest"`);
    }
    return ext;
}

/** @param {string} resolved @param {string | null} packageName @param {string | undefined} exactVersion @param {string | undefined} selector */
function hasExpectedVersion(resolved, packageName, exactVersion, selector) {
    if (!packageName) return true;
    const version = readResolvedPackage(resolved, packageName)?.version;
    if (!version) return false;
    if (exactVersion) return version === exactVersion;
    if (selector && semver.validRange(selector)) return semver.satisfies(version, selector);
    return true;
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
        update: source.update,
        detect: source.detect,
        prompts: source.prompts,
    };
}
