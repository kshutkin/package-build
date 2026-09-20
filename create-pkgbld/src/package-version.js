import { spawn } from 'node:child_process';

import semver from 'semver';

/**
 * Resolve the newest stable exact version published for a package selector.
 * @param {string} packageName
 * @param {string} selector
 * @param {(command: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} [runner]
 */
export async function resolvePublishedVersion(packageName, selector, runner = runCapture) {
    const requested = `${packageName}@${selector || 'latest'}`;
    const result = await runner('npm', ['view', requested, 'version', '--json']);
    if (result.code !== 0) {
        const detail = result.stderr.trim();
        throw new Error(`Cannot resolve a published version for "${requested}"${detail ? `: ${detail}` : ''}`);
    }

    let value;
    try {
        value = JSON.parse(result.stdout);
    } catch {
        throw new Error(`npm returned invalid version metadata for "${requested}"`);
    }
    const versions = (Array.isArray(value) ? value : [value]).filter(
        version => typeof version === 'string' && semver.valid(version) && semver.prerelease(version) === null
    );
    const version = semver.rsort(versions)[0];
    if (!version) throw new Error(`No stable published version satisfies "${requested}"`);
    return version;
}

/** @param {string} command @param {string[]} args */
function runCapture(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => {
            stdout += chunk;
        });
        child.stderr.on('data', chunk => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    });
}
