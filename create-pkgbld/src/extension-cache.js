import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import findCacheDirectory from 'find-cache-directory';

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

/**
 * Install an extension in create-pkgbld's shared cache.
 * @param {{ package: string, version?: string }} entry
 * @param {string} [cacheDir]
 * @param {(command: string, args: string[], cwd: string) => Promise<number>} [runner]
 */
export async function installCachedExtension(entry, cacheDir = getExtensionCacheDir(), runner = runCommand) {
    const packageName = getPackageName(entry.package);
    if (!packageName) throw new Error(`Extension package "${entry.package}" cannot be installed in the shared cache`);

    await mkdir(cacheDir, { recursive: true });
    const manifestPath = path.join(cacheDir, 'package.json');
    let manifest = { private: true, dependencies: /** @type {Record<string, string>} */ ({}) };
    try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.private = true;
        manifest.dependencies ??= {};
    } catch {
        // The cache is initialized on first use.
    }

    const requestedVersion = entry.version ?? 'latest';
    const packageManifest = path.join(cacheDir, 'node_modules', packageName, 'package.json');
    if (manifest.dependencies[packageName] === requestedVersion) {
        if (await hasCachedPackage(packageManifest, requestedVersion)) return cacheDir;
    }
    const previousVersion = manifest.dependencies[packageName];
    manifest.dependencies[packageName] = requestedVersion;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const code = await runner('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], cacheDir);
    if (code !== 0) {
        if (previousVersion === undefined) delete manifest.dependencies[packageName];
        else manifest.dependencies[packageName] = previousVersion;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        throw new Error(`Failed to cache extension package "${packageName}" (npm install exited with code ${code})`);
    }
    if (!(await hasCachedPackage(packageManifest, requestedVersion))) {
        throw new Error(`npm install completed without caching extension package "${packageName}"`);
    }
    return cacheDir;
}

/** @param {string} manifestPath @param {string} requestedVersion */
async function hasCachedPackage(manifestPath, requestedVersion) {
    try {
        const installed = JSON.parse(await readFile(manifestPath, 'utf8'));
        const exact = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(requestedVersion);
        return !exact || installed.version === requestedVersion;
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
