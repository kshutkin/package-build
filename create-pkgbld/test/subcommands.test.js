import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { getExtensionCacheSlot } from '../src/extension-cache.js';
import { LOCK_SCHEMA } from '../src/project-lock.js';

const cliEntry = path.resolve(import.meta.dirname, '..', 'index.js');
const biomePackage = 'create-pkgbld-extension-biome';
const thirdPartyPlugin = '@author/pkgbld-plugin-example';

/** @type {string} */
let dir;
const originalCacheDir = process.env.CREATE_PKGBLD_CACHE_DIR;

/** @param {string[]} argv @param {string} cwd @param {Record<string, string>} [env] */
function runCli(argv, cwd, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliEntry, ...argv], {
            cwd,
            env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
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
            JSON.stringify({
                name: thirdPartyPlugin,
                version: '1.2.3',
                type: 'module',
                main: 'index.js',
                peerDependencies: { pkgbld: '^1.0.0' },
            })
        );
        await fs.writeFile(path.join(pluginDir, 'index.js'), 'export function create() { return {}; }\n');
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify(
                { name: 'host', version: '0.0.1', devDependencies: { [thirdPartyPlugin]: '^1.2.0', pkgbld: '^1.0.0' } },
                null,
                2
            )}\n`
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
        assert.strictEqual(pkg.devDependencies[thirdPartyPlugin], undefined);
        assert.strictEqual(pkg.devDependencies.pkgbld, '^1.0.0');
        const afterRemove = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.deepStrictEqual(afterRemove.packages, {});
    });

    test('generic plugin removal clears every dependency field', async () => {
        const pluginDir = path.join(dir, 'node_modules', '@author', 'pkgbld-plugin-example');
        await fs.mkdir(pluginDir, { recursive: true });
        await fs.writeFile(
            path.join(pluginDir, 'package.json'),
            JSON.stringify({
                name: thirdPartyPlugin,
                version: '1.2.3',
                main: 'index.js',
                peerDependencies: { pkgbld: '^1.0.0' },
            })
        );
        await fs.writeFile(path.join(pluginDir, 'index.js'), 'module.exports = {};\n');
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify(
                {
                    name: 'host',
                    dependencies: { [thirdPartyPlugin]: '1.2.3' },
                    devDependencies: { [thirdPartyPlugin]: '1.2.3', pkgbld: '^1.0.0' },
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
        assert.strictEqual(pkg.devDependencies[thirdPartyPlugin], undefined);
        assert.strictEqual(pkg.devDependencies.pkgbld, '^1.0.0');
        assert.strictEqual(pkg.peerDependencies, undefined);
    });

    test('adoption requires a resolvable exact package version', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', devDependencies: { [thirdPartyPlugin]: '^1.2.0' } }, null, 2)}\n`
        );
        const { code, stderr } = await runCli(['add', thirdPartyPlugin, '--yes'], dir);
        assert.notStrictEqual(code, 0);
        assert.match(stderr, /Install project dependencies/);
        await assert.rejects(() => fs.access(path.join(dir, '.pkgbld-lock.json')));
    });

    test('excludes a locked third-party plugin without verifiable modern metadata', async () => {
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
        assert.notStrictEqual(result.code, 0);
        assert.match(result.stderr, /cannot be verified/);
    });

    test('updates an official extension and advances its exact locked version', async () => {
        await prepareBiomeUpdate('biome old');
        const fakeBin = await writeFakeNpm('0.1.0');

        const result = await runCli(['update', 'biome', '--yes', '--quiet'], dir, {
            PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        });
        assert.strictEqual(result.code, 0, result.stdout + result.stderr);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(pkg.scripts.lint, 'biome new');
        assert.strictEqual(lock.packages[biomePackage], '0.1.0');
    });

    test('--yes does not accept update conflicts but --accept-conflicts does', async () => {
        await prepareBiomeUpdate('custom lint');
        const fakeBin = await writeFakeNpm('0.1.0');
        const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };

        let result = await runCli(['update', 'biome', '--yes', '--quiet'], dir, env);
        assert.notStrictEqual(result.code, 0);
        assert.match(result.stderr, /--accept-conflicts/);
        let pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        let lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(pkg.scripts.lint, 'custom lint');
        assert.strictEqual(lock.packages[biomePackage], '0.0.1');

        result = await runCli(['update', 'biome', '--yes', '--quiet', '--accept-conflicts'], dir, env);
        assert.strictEqual(result.code, 0, result.stdout + result.stderr);
        pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(pkg.scripts.lint, 'biome new');
        assert.strictEqual(lock.packages[biomePackage], '0.1.0');
    });
});

async function prepareBiomeUpdate(currentScript) {
    await writeExtensionPackage(path.join(dir, 'node_modules', biomePackage), '0.0.1', 'biome old');
    await writeExtensionPackage(
        path.join(getExtensionCacheSlot(biomePackage, '0.1.0'), 'node_modules', biomePackage),
        '0.1.0',
        'biome new'
    );
    await fs.writeFile(
        path.join(dir, 'package.json'),
        `${JSON.stringify({ name: 'host', version: '0.0.1', scripts: { lint: currentScript } }, null, 2)}\n`
    );
    await fs.writeFile(
        path.join(dir, '.pkgbld-lock.json'),
        `${JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [biomePackage]: '0.0.1' } }, null, 2)}\n`
    );
}

async function writeExtensionPackage(packageDir, version, script) {
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name: biomePackage, version, type: 'module', main: 'index.js' })
    );
    await fs.writeFile(
        path.join(packageDir, 'index.js'),
        `export const manifest = { name: 'biome', description: 'Biome' };\nexport const setup = { scripts: { lint: '${script}' } };\nexport const remove = { scripts: ['lint'] };\nexport const detect = tree => Boolean(tree.readJson('package.json')?.scripts?.lint);\n`
    );
}

async function writeFakeNpm(version) {
    const binDir = path.join(dir, 'fake-bin');
    await fs.mkdir(binDir, { recursive: true });
    const npmPath = path.join(binDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const script = process.platform === 'win32' ? `@echo "${version}"\r\n` : `#!/bin/sh\nprintf '"${version}"\\n'\n`;
    await fs.writeFile(npmPath, script, { mode: 0o755 });
    return binDir;
}
