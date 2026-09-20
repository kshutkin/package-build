import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

const cliEntry = path.resolve(import.meta.dirname, '..', 'index.js');
const biomePackage = 'create-pkgbld-extension-biome';
const thirdPartyPlugin = '@author/pkgbld-plugin-example';

/** @type {string} */
let dir;
const originalCacheDir = process.env.CREATE_PKGBLD_CACHE_DIR;

/** @param {string[]} argv @param {string} cwd */
function runCli(argv, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliEntry, ...argv], {
            cwd,
            env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', data => {
            stdout += data.toString();
        });
        child.stderr.on('data', data => {
            stderr += data.toString();
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
    });
}

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'subcmd-test-'));
    const cacheDir = path.join(dir, 'extension-cache');
    const packageDir = path.join(cacheDir, 'node_modules', biomePackage);
    await fs.mkdir(path.dirname(packageDir), { recursive: true });
    await fs.symlink(path.resolve(import.meta.dirname, '../..', biomePackage), packageDir);
    await fs.writeFile(path.join(cacheDir, 'package.json'), JSON.stringify({ private: true, dependencies: { [biomePackage]: '^0.1.0' } }));
    process.env.CREATE_PKGBLD_CACHE_DIR = cacheDir;
    await fs.writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'host', version: '0.0.1' }, null, 2)}\n`);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    if (originalCacheDir === undefined) delete process.env.CREATE_PKGBLD_CACHE_DIR;
    else process.env.CREATE_PKGBLD_CACHE_DIR = originalCacheDir;
});

describe('CLI subcommands', () => {
    test('list shows official packages and ignores .pkgbld-extensions.json', async () => {
        await fs.writeFile(
            path.join(dir, '.pkgbld-extensions.json'),
            JSON.stringify({ extensions: [{ name: 'legacy', package: 'create-pkgbld-extension-legacy', description: 'Legacy' }] })
        );
        const { code, stdout } = await runCli(['list', '--quiet'], dir);
        assert.strictEqual(code, 0, stdout);
        assert.match(stdout, /biome.*\[Available\]/);
        assert.doesNotMatch(stdout, /legacy/);
    });

    test('add --dry-run includes the project lock but writes nothing', async () => {
        const before = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
        const { code, stdout, stderr } = await runCli(['add', 'biome', '--yes', '--dry-run'], dir);
        assert.strictEqual(code, 0, stdout + stderr);
        assert.match(stdout, /CREATE.*\.pkgbld-lock\.json/);
        assert.match(stdout, /CREATE.*biome\.json/);
        assert.strictEqual(await fs.readFile(path.join(dir, 'package.json'), 'utf8'), before);
        await assert.rejects(() => fs.access(path.join(dir, '.pkgbld-lock.json')));
    });

    test('add writes extension changes and its exact resolved version to the lock', async () => {
        const { code, stdout, stderr } = await runCli(['add', 'biome', '--yes'], dir);
        assert.strictEqual(code, 0, stdout + stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.ok(pkg.devDependencies['@biomejs/biome']);
        assert.strictEqual(pkg.devDependencies[biomePackage], undefined);
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(lock.packages[biomePackage], '0.1.0');

        const list = await runCli(['list', '--quiet'], dir);
        assert.match(list.stdout, /biome.*\[Installed, managed\]/);
    });

    test('remove reverses extension changes and removes its lock entry', async () => {
        let result = await runCli(['add', 'biome', '--yes', '--quiet'], dir);
        assert.strictEqual(result.code, 0, result.stdout + result.stderr);
        result = await runCli(['remove', 'biome', '--yes', '--quiet'], dir);
        assert.strictEqual(result.code, 0, result.stdout + result.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies?.['@biomejs/biome'], undefined);
        await assert.rejects(() => fs.access(path.join(dir, 'biome.json')));
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.deepStrictEqual(lock.packages, {});
    });

    test('discovers and adopts an installed scoped third-party plugin', async () => {
        const pluginDir = path.join(dir, 'node_modules', '@author', 'pkgbld-plugin-example');
        await fs.mkdir(pluginDir, { recursive: true });
        await fs.writeFile(
            path.join(pluginDir, 'package.json'),
            JSON.stringify({ name: thirdPartyPlugin, version: '1.2.3', type: 'module', main: 'index.js' })
        );
        await fs.writeFile(path.join(pluginDir, 'index.js'), 'export function create() { return {}; }\n');
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', version: '0.0.1', devDependencies: { [thirdPartyPlugin]: '^1.2.0' } }, null, 2)}\n`
        );

        const listed = await runCli(['list', '--quiet'], dir);
        assert.match(listed.stdout, /@author\/pkgbld-plugin-example.*\[Installed, unmanaged\]/);

        const adopted = await runCli(['add', thirdPartyPlugin, '--yes', '--quiet'], dir);
        assert.strictEqual(adopted.code, 0, adopted.stdout + adopted.stderr);
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(lock.packages[thirdPartyPlugin], '1.2.3');

        const removed = await runCli(['remove', thirdPartyPlugin, '--yes', '--quiet'], dir);
        assert.strictEqual(removed.code, 0, removed.stdout + removed.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies, undefined);
        const afterRemove = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.deepStrictEqual(afterRemove.packages, {});
    });

    test('generic plugin removal clears every dependency field', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify(
                {
                    name: 'host',
                    dependencies: { [thirdPartyPlugin]: '1.2.3' },
                    devDependencies: { [thirdPartyPlugin]: '1.2.3' },
                    peerDependencies: { [thirdPartyPlugin]: '1.2.3' },
                },
                null,
                2
            )}\n`
        );
        const removed = await runCli(['remove', thirdPartyPlugin, '--yes', '--quiet'], dir);
        assert.strictEqual(removed.code, 0, removed.stdout + removed.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.dependencies, undefined);
        assert.strictEqual(pkg.devDependencies, undefined);
        assert.strictEqual(pkg.peerDependencies, undefined);
    });

    test('adoption requires a resolvable exact package version', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', devDependencies: { [thirdPartyPlugin]: '^1.2.0' } }, null, 2)}\n`
        );
        const { code, stderr } = await runCli(['add', thirdPartyPlugin, '--yes'], dir);
        assert.notStrictEqual(code, 0);
        assert.match(stderr, /install project dependencies first/);
        await assert.rejects(() => fs.access(path.join(dir, '.pkgbld-lock.json')));
    });

    test('reapplies a locked third-party plugin without assuming an extension export', async () => {
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            `${JSON.stringify(
                {
                    $schema: 'https://unpkg.com/create-pkgbld/lock-schema-v1.json',
                    packages: { [thirdPartyPlugin]: '1.2.3' },
                },
                null,
                2
            )}\n`
        );
        const result = await runCli(['add', thirdPartyPlugin, '--yes', '--quiet'], dir);
        assert.strictEqual(result.code, 0, result.stdout + result.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies[thirdPartyPlugin], '1.2.3');
    });
});
