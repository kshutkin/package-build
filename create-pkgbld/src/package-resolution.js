import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Read package identity by walking upward from an already resolved module.
 * @param {string} resolved
 * @param {string} expectedName
 */
export function readResolvedPackage(resolved, expectedName) {
    let dir = path.dirname(resolved);
    for (;;) {
        const manifestPath = path.join(dir, 'package.json');
        try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (manifest.name === expectedName && typeof manifest.version === 'string') {
                return { name: expectedName, version: manifest.version, dir };
            }
        } catch {
            // Continue toward the filesystem root.
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Resolve the exact installed version from the target project without importing it.
 * @param {string} packageName
 * @param {string} projectRoot
 */
export function resolveInstalledPackage(packageName, projectRoot) {
    try {
        const resolved = createRequire(path.join(projectRoot, 'package.json')).resolve(packageName);
        return readResolvedPackage(resolved, packageName);
    } catch {
        return null;
    }
}
