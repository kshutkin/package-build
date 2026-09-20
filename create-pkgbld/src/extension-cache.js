import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import findCacheDirectory from 'find-cache-directory';
import semver from 'semver';

import { resolvePublishedVersion } from './package-version.js';

/** @returns {string} */
export function getExtensionCacheDir() {
    if (process.env.CREATE_PKGBLD_CACHE_DIR) return path.resolve(process.env.CREATE_PKGBLD_CACHE_DIR);
    const cacheDir = findCacheDirectory({ name: 'create-pkgbld', cwd: import.meta.dirname });
    if (!cacheDir) throw new Error('Cannot locate a shared cache directory for create-pkgbld');
    return path.join(cacheDir, 'extensions');
}

/**
 * Return the installable package name from a package or package/subpath specifier.
 * Relative and absolute paths are intentionally not installable.
 * @param {string} specifier
 */
export function getPackageName(specifier) {
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) return null;
    const parts = specifier.split('/');
    if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    return parts[0] || null;
}

/** @param {string} packageName @param {string} version @param {string} [cacheRoot] */
export function getExtensionCacheSlot(packageName, version, cacheRoot = getExtensionCacheDir()) {
    return path.join(cacheRoot, encodeURIComponent(packageName), version);
}

/**
 * Return cached exact-version roots newest first.
 * @param {string} packageName
 * @param {string | undefined} selector
 * @param {string} [cacheRoot]
 */
export async function listCachedExtensionSlots(packageName, selector, cacheRoot = getExtensionCacheDir()) {
    const packageRoot = path.join(cacheRoot, encodeURIComponent(packageName));
    let versions;
    try {
        versions = await readdir(packageRoot);
    } catch {
        return [];
    }
    return semver
        .rsort(versions.filter(version => semver.valid(version) && (!selector || semver.satisfies(version, selector))))
        .map(version => ({ version, cacheDir: getExtensionCacheSlot(packageName, version, cacheRoot) }));
}

/**
 * Install one exact extension version in an immutable shared-cache slot.
 * A range is resolved before the slot is selected.
 * @param {{ package: string, version?: string }} entry
 * @param {string} [cacheRoot]
 * @param {(command: string, args: string[], cwd: string) => Promise<number>} [runner]
 * @param {(packageName: string, selector: string) => Promise<string>} [versionResolver]
 */
export async function installCachedExtension(
    entry,
    cacheRoot = getExtensionCacheDir(),
    runner = runCommand,
    versionResolver = resolvePublishedVersion
) {
    const packageName = getPackageName(entry.package);
    if (!packageName) throw new Error(`Extension package "${entry.package}" cannot be installed in the shared cache`);

    const selector = entry.version ?? 'latest';
    const exactVersion = semver.valid(selector) ?? (await versionResolver(packageName, selector));
    const cacheDir = getExtensionCacheSlot(packageName, exactVersion, cacheRoot);
    const manifestPath = path.join(cacheDir, 'package.json');
    const packageManifest = path.join(cacheDir, 'node_modules', packageName, 'package.json');
    if (await hasCachedPackage(packageManifest, exactVersion)) return { cacheDir, version: exactVersion };

    await mkdir(cacheDir, { recursive: true });
    const manifest = { private: true, dependencies: { [packageName]: exactVersion } };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const code = await runner('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], cacheDir);
    if (code !== 0) {
        await writeFile(manifestPath, `${JSON.stringify({ private: true, dependencies: {} }, null, 2)}\n`);
        throw new Error(`Failed to cache extension package "${packageName}@${exactVersion}" (npm install exited with code ${code})`);
    }
    if (!(await hasCachedPackage(packageManifest, exactVersion))) {
        throw new Error(`npm install completed without caching extension package "${packageName}@${exactVersion}"`);
    }
    return { cacheDir, version: exactVersion };
}

/** @param {string} manifestPath @param {string} exactVersion */
async function hasCachedPackage(manifestPath, exactVersion) {
    try {
        const installed = JSON.parse(await readFile(manifestPath, 'utf8'));
        return installed.version === exactVersion;
    } catch {
        return false;
    }
}

/** @param {string} command @param {string[]} args @param {string} cwd */
function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 1));
    });
}
