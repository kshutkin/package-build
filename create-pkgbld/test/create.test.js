import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-pkgbld-create-test-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

/** @param {string[]} argv */
function runCli(argv) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliEntry, ...argv], { cwd: dir });
        let stderr = '';
        child.stderr.on('data', chunk => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stderr }));
    });
}

describe('default command', () => {
    test('creates a new package from detected defaults without opening the update UI', async () => {
        const result = /** @type {{ code: number | null; stderr: string }} */ (await runCli(['new-package', '--quiet']));
        assert.strictEqual(result.code, 0, result.stderr);

        const projectDir = path.join(dir, 'new-package');
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.name, 'new-package');
        assert.strictEqual(pkg.version, '0.0.1');
        assert.strictEqual(pkg.license, 'MIT');
        assert.strictEqual(pkg.readme, 'README.md');
        assert.strictEqual(await fs.readFile(path.join(projectDir, 'README.md'), 'utf8'), '# new-package');
    });

    test('quiet update preserves the existing package metadata and scripts', async () => {
        const projectDir = path.join(dir, 'existing-package');
        const pkg = {
            name: 'existing-package',
            version: '1.2.3',
            scripts: { build: 'custom-build --quoted="two words"' },
        };
        await fs.mkdir(projectDir);
        await fs.writeFile(path.join(projectDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
        await fs.writeFile(path.join(projectDir, 'README.md'), '# Existing\n');

        const result = /** @type {{ code: number | null; stderr: string }} */ (await runCli(['existing-package', '--quiet']));
        assert.strictEqual(result.code, 0, result.stderr);
        assert.deepStrictEqual(JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8')), pkg);
        assert.strictEqual(await fs.readFile(path.join(projectDir, 'README.md'), 'utf8'), '# Existing\n');
    });
});
