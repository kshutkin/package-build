import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Detect the package manager for the given project root, based on lockfile
 * presence. Defaults to `npm`.
 *
 * @param {string} projectRoot
 * @returns {'pnpm' | 'yarn' | 'npm'}
 */
export function detectPackageManager(projectRoot) {
    if (existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
    return 'npm';
}

/**
 * Return true if any of the given FileChanges touch dependency-related
 * fields in package.json. Compares against a snapshot taken before commit.
 *
 * @param {readonly import('./tree.js').FileChange[]} changes
 * @param {any} beforePackageJson
 */
export function changesAffectDependencies(changes, beforePackageJson) {
    for (const c of changes) {
        if (!c.path.endsWith('package.json') || c.type === 'DELETE' || typeof c.content !== 'string') continue;
        let after;
        try {
            after = JSON.parse(c.content);
        } catch {
            continue;
        }
        const before = beforePackageJson ?? {};
        for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (JSON.stringify(/** @type {any} */ (before)[group] ?? {}) !== JSON.stringify(after[group] ?? {})) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Spawn `<pm> install` in the project root. Inherits stdio so the user sees
 * live progress. Never invoked automatically — only when the caller has
 * confirmed (e.g. via `--install` flag or interactive prompt).
 *
 * @param {'pnpm' | 'yarn' | 'npm'} pm
 * @param {string} projectRoot
 * @returns {Promise<number>}
 */
export function runInstall(pm, projectRoot) {
    return new Promise((resolve, reject) => {
        const child = spawn(pm, ['install'], { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 0));
    });
}
