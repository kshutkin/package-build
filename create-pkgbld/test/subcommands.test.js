import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '..', 'index.js');

/** @type {string} */
let dir;
/** @type {string} */
let extPkgDir;

/**
 * @param {string[]} argv
 * @param {string} cwd
 */
function runCli(argv, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliEntry, ...argv], {
            cwd,
            env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => {
            stdout += d.toString();
        });
        child.stderr.on('data', d => {
            stderr += d.toString();
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
    });
}

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `subcmd-test-${Math.random().toString(36).slice(2)}`);
    extPkgDir = path.join(dir, 'fixture-ext');
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(extPkgDir, { recursive: true });

    await fs.writeFile(path.join(extPkgDir, 'package.json'), JSON.stringify({ name: 'fixture-ext', main: 'index.js' }));
    await fs.writeFile(
        path.join(extPkgDir, 'index.js'),
        `export const manifest = { name: 'fixture', description: 'Fixture extension' };
export const setup = {
    devDependencies: { 'fixture-pkg': '^1.0.0' },
    scripts: { 'fixture:run': 'fixture run' },
    files: { 'fixture.config.json': 'inline:{"ok":true}\\n' },
};
export const remove = {
    devDependencies: ['fixture-pkg'],
    scripts: ['fixture:run'],
    files: ['fixture.config.json'],
};
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fixture-pkg']);
}
`
    );

    await fs.writeFile(
        path.join(dir, '.pkgbld-extensions.json'),
        JSON.stringify({
            extensions: [{ name: 'fixture', package: './fixture-ext/index.js', description: 'Fixture' }],
        })
    );
    await fs.writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'host', version: '0.0.1' }, null, 2)}\n`);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('CLI subcommands', () => {
    test('list shows built-in and local entries with status', async () => {
        const { code, stdout } = await runCli(['list', '--quiet'], dir);
        assert.strictEqual(code, 0, stdout);
        assert.match(stdout, /biome/);
        assert.match(stdout, /pkgbld-swc/);
        assert.match(stdout, /pkgbld-dts-buddy/);
        assert.match(stdout, /fixture/);
        assert.match(stdout, /\[Not installed\]/);
    });

    test('add --dry-run prints CREATE/UPDATE but writes nothing', async () => {
        const before = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
        const { code, stdout } = await runCli(['add', 'fixture', '--yes', '--dry-run'], dir);
        assert.strictEqual(code, 0, stdout);
        assert.match(stdout, /UPDATE.*package\.json/);
        assert.match(stdout, /CREATE.*fixture\.config\.json/);
        const after = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
        assert.strictEqual(after, before);
        await assert.rejects(() => fs.access(path.join(dir, 'fixture.config.json')));
    });

    test('add --yes writes changes to disk', async () => {
        const { code, stdout } = await runCli(['add', 'fixture', '--yes'], dir);
        assert.strictEqual(code, 0, stdout);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies['fixture-pkg'], '^1.0.0');
        assert.strictEqual(pkg.scripts['fixture:run'], 'fixture run');
        const cfg = await fs.readFile(path.join(dir, 'fixture.config.json'), 'utf8');
        assert.strictEqual(cfg, '{"ok":true}\n');

        const list = await runCli(['list', '--quiet'], dir);
        assert.match(list.stdout, /fixture.*\[Installed\]/);
    });

    test('remove --yes reverses changes', async () => {
        let res = await runCli(['add', 'fixture', '--yes', '--quiet'], dir);
        assert.strictEqual(res.code, 0, res.stdout + res.stderr);
        res = await runCli(['remove', 'fixture', '--yes', '--quiet'], dir);
        assert.strictEqual(res.code, 0, res.stdout + res.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.ok(!pkg.devDependencies || !pkg.devDependencies['fixture-pkg']);
        assert.ok(!pkg.scripts || !pkg.scripts['fixture:run']);
        await assert.rejects(() => fs.access(path.join(dir, 'fixture.config.json')));
    });

    test('add unknown extension exits non-zero', async () => {
        const { code, stderr } = await runCli(['add', 'does-not-exist', '--yes'], dir);
        assert.notStrictEqual(code, 0);
        assert.match(stderr, /not found/);
    });
});
