import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { detectExtension, runRemove, runSetup } from '../src/engine.js';
import { loadRegistry, resolveExtension } from '../src/registry.js';
import { Tree } from '../src/tree.js';

const builtinRegistryPath = path.resolve(import.meta.dirname, '..', 'extensions.json');

/** @type {string} */
let dir;
const originalCacheDir = process.env.CREATE_PKGBLD_CACHE_DIR;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `builtin-ext-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }));
    const cacheDir = path.join(dir, 'extension-cache');
    const modulesDir = path.join(cacheDir, 'node_modules');
    await fs.mkdir(modulesDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'package.json'), JSON.stringify({ private: true }));
    for (const packageName of [
        'create-pkgbld-extension-biome',
        'create-pkgbld-extension-dts-buddy',
        'pkgbld-plugin-swc',
        'pkgbld-plugin-dts-buddy',
    ]) {
        await fs.symlink(path.resolve(import.meta.dirname, '../..', packageName), path.join(modulesDir, packageName));
    }
    process.env.CREATE_PKGBLD_CACHE_DIR = cacheDir;
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    if (originalCacheDir === undefined) delete process.env.CREATE_PKGBLD_CACHE_DIR;
    else process.env.CREATE_PKGBLD_CACHE_DIR = originalCacheDir;
});

describe('built-in extensions registry', () => {
    test('all built-ins resolve and expose manifest/setup/remove/detect', async () => {
        const entries = await loadRegistry(builtinRegistryPath, dir);
        assert.deepStrictEqual(entries.map(e => e.name).sort(), ['biome', 'dts-buddy', 'pkgbld-dts-buddy', 'pkgbld-swc']);
        for (const entry of entries) {
            const ext = await resolveExtension(entry, dir);
            assert.ok(ext.manifest, `${entry.name} manifest`);
            assert.ok(ext.setup, `${entry.name} setup`);
            assert.ok(ext.remove, `${entry.name} remove`);
            assert.strictEqual(typeof ext.detect, 'function', `${entry.name} detect`);
        }
    });

    test('biome: setup adds biome dep + scripts + biome.json; remove reverses; detect flips', async () => {
        const entries = await loadRegistry(builtinRegistryPath, dir);
        const entry = entries.find(e => e.name === 'biome');
        const ext = await resolveExtension(entry, dir);

        const tree = new Tree(dir);
        assert.strictEqual(detectExtension(ext, tree), false);

        await runSetup(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.ok(pkg.devDependencies['@biomejs/biome'].startsWith('^2.'));
        assert.strictEqual(pkg.scripts.lint, 'biome check ./src');
        assert.strictEqual(pkg.scripts['lint:fix'], 'biome check --fix ./src');
        const biomeJson = tree.read('biome.json');
        assert.ok(biomeJson?.includes('"linter"'));
        assert.strictEqual(detectExtension(ext, tree), true);

        await runRemove(ext, tree);
        const pkg2 = tree.readJson('package.json');
        assert.strictEqual(pkg2.devDependencies?.['@biomejs/biome'], undefined);
        assert.strictEqual(pkg2.scripts?.lint, undefined);
        assert.ok(!tree.listChanges().some(c => c.path === 'biome.json'));
        assert.strictEqual(detectExtension(ext, tree), false);
    });

    test('pkgbld-swc: setup adds devDep; remove reverses; detect flips', async () => {
        const entries = await loadRegistry(builtinRegistryPath, dir);
        const entry = entries.find(e => e.name === 'pkgbld-swc');
        const ext = await resolveExtension(entry, dir);

        const tree = new Tree(dir);
        assert.strictEqual(detectExtension(ext, tree), false);

        await runSetup(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.ok(pkg.devDependencies['pkgbld-plugin-swc']);
        assert.strictEqual(detectExtension(ext, tree), true);

        await runRemove(ext, tree);
        const pkg2 = tree.readJson('package.json');
        assert.strictEqual(pkg2.devDependencies?.['pkgbld-plugin-swc'], undefined);
        assert.strictEqual(detectExtension(ext, tree), false);
    });

    test('pkgbld-dts-buddy: setup adds devDep; remove reverses; detect flips', async () => {
        const entries = await loadRegistry(builtinRegistryPath, dir);
        const entry = entries.find(e => e.name === 'pkgbld-dts-buddy');
        const ext = await resolveExtension(entry, dir);

        const tree = new Tree(dir);
        assert.strictEqual(detectExtension(ext, tree), false);

        await runSetup(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.ok(pkg.devDependencies['pkgbld-plugin-dts-buddy']);
        assert.strictEqual(detectExtension(ext, tree), true);

        await runRemove(ext, tree);
        const pkg2 = tree.readJson('package.json');
        assert.strictEqual(pkg2.devDependencies?.['pkgbld-plugin-dts-buddy'], undefined);
        assert.strictEqual(detectExtension(ext, tree), false);
    });
    test('standalone dts-buddy generates declarations without a PKG BLD plugin and removal retains TypeScript', async () => {
        await fs.mkdir(path.join(dir, 'src'));
        await fs.writeFile(path.join(dir, 'src/index.ts'), 'export const answer: number = 42;\n');
        await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', declaration: true } }));
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({
                name: 'demo',
                version: '0.0.0',
                types: './types/index.d.ts',
                exports: { '.': { types: './types/index.d.ts', default: './src/index.ts' } },
            })
        );
        const entries = await loadRegistry(builtinRegistryPath, dir);
        const entry = entries.find(e => e.name === 'dts-buddy');
        assert.strictEqual(entry.package, 'create-pkgbld-extension-dts-buddy');
        const ext = await resolveExtension(entry, dir);
        const tree = new Tree(dir);
        assert.strictEqual(detectExtension(ext, tree), false);
        await runSetup(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.ok(pkg.devDependencies['dts-buddy']);
        assert.ok(pkg.devDependencies.typescript);
        assert.strictEqual(pkg.devDependencies['pkgbld-plugin-dts-buddy'], undefined);
        assert.strictEqual(pkg.scripts['build:types'], 'dts-buddy');
        assert.strictEqual(detectExtension(ext, tree), true);

        const buddyEntry = fileURLToPath(import.meta.resolve('dts-buddy'));
        await promisify(execFile)(process.execPath, [path.join(path.dirname(buddyEntry), 'cli.js')], { cwd: dir });
        const declarations = await fs.readFile(path.join(dir, 'types/index.d.ts'), 'utf8');
        assert.match(declarations, /answer/);
        assert.match(declarations, /declare module ['"]demo['"]/);

        await runRemove(ext, tree);
        const removed = tree.readJson('package.json');
        assert.strictEqual(removed.devDependencies?.['dts-buddy'], undefined);
        assert.strictEqual(removed.scripts?.['build:types'], undefined);
        assert.ok(removed.devDependencies.typescript);
        assert.strictEqual(removed.types, './types/index.d.ts');
        assert.strictEqual(detectExtension(ext, tree), false);
    });
});
