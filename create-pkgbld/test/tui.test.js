import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { buildExtensionMenuItems, getPromptOption, toggleExtensionIntent } from '../src/tui.js';

/** @type {string} */
let dir;
const extensionPackage = 'create-pkgbld-extension-fixture';
const entry = { name: 'fixture', package: extensionPackage, version: '^1.0.0', description: 'fix', official: true };

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tui-test-'));
    const extDir = path.join(dir, 'node_modules', extensionPackage);
    await fs.mkdir(extDir, { recursive: true });
    await fs.writeFile(
        path.join(extDir, 'package.json'),
        JSON.stringify({ name: extensionPackage, version: '1.2.3', type: 'module', main: 'index.js' })
    );
    await fs.writeFile(
        path.join(extDir, 'index.js'),
        `export const manifest = { name: 'fixture', description: 'Fixture' };
export const setup = { devDependencies: { 'fix-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fix-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fix-pkg']);
}
`
    );
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('getPromptOption', () => {
    test('builds a text prompt by default', () => {
        const cfg = getPromptOption({ title: 'Name', field: 'name', initialValue: 'foo' }, { name: 'foo' });
        assert.strictEqual(cfg.type, 'text');
        assert.strictEqual(cfg.name, 'name');
        assert.strictEqual(cfg.initial, 'foo');
    });

    test('multiselect builds choices with selected flag', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'multiselect', list: ['a', 'b'] }, { f: ['b'] });
        const choices = /** @type {any[]} */ (cfg.choices);
        assert.strictEqual(choices[1].selected, true);
        assert.strictEqual(choices[0].selected, false);
    });

    test('select resolves initial index from value', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'select', list: ['a', 'b', 'c'] }, { f: 'c' });
        assert.strictEqual(cfg.initial, 2);
    });
});

describe('buildExtensionMenuItems', () => {
    test('reports a missing official extension as available without downloading it', async () => {
        const items = await buildExtensionMenuItems(
            [{ name: 'missing', package: 'create-pkgbld-extension-missing', version: '^1.0.0', description: 'x', official: true }],
            dir
        );
        assert.strictEqual(items[0].state, 'available');
        assert.strictEqual(items[0].ext, null);
        assert.match(/** @type {string} */ (items[0].error), /Cannot resolve/);
    });

    test('computes available when detect returns false', async () => {
        const [item] = await buildExtensionMenuItems([entry], dir);
        assert.strictEqual(item.state, 'available');
        assert.strictEqual(item.resolvedVersion, '1.2.3');
    });

    test('computes installed-unmanaged when artifacts are detected without a lock', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', devDependencies: { 'fix-pkg': '^1.0.0' } }));
        const [item] = await buildExtensionMenuItems([entry], dir);
        assert.strictEqual(item.state, 'installed-unmanaged');
    });
});

describe('toggleExtensionIntent', () => {
    test('available → setup, then clear', () => {
        const item = /** @type {any} */ ({ state: 'available', intent: null, options: {} });
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, 'setup');
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, null);
    });

    test('managed → remove; unmanaged → adopt', () => {
        const managed = /** @type {any} */ ({ state: 'installed-managed', intent: null, options: {} });
        const unmanaged = /** @type {any} */ ({ state: 'installed-unmanaged', intent: null, options: {} });
        toggleExtensionIntent(managed);
        toggleExtensionIntent(unmanaged);
        assert.strictEqual(managed.intent, 'remove');
        assert.strictEqual(unmanaged.intent, 'adopt');
    });

    test('clearing intent also wipes options', () => {
        const item = /** @type {any} */ ({ state: 'available', intent: 'setup', options: { x: 1 } });
        toggleExtensionIntent(item);
        assert.deepStrictEqual(item.options, {});
    });
});
