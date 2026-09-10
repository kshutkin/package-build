import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { detectExtension, runRemove, runSetup } from '../src/engine.js';
import { loadRegistry, resolveExtension } from '../src/registry.js';
import { Tree } from '../src/tree.js';

const builtinRegistryPath = path.resolve(import.meta.dirname, '..', 'extensions.json');

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `builtin-ext-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('built-in extensions registry', () => {
    test('all three resolve and expose manifest/setup/remove/detect', async () => {
        const entries = await loadRegistry(builtinRegistryPath, dir);
        assert.deepStrictEqual(entries.map(e => e.name).sort(), ['biome', 'pkgbld-dts-buddy', 'pkgbld-swc']);
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
});
