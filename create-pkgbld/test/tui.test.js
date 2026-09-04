import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { buildExtensionMenuItems, getOptionsValue, getPromptOption, toggleExtensionIntent } from '../src/tui.js';

/** @type {string} */
let dir;
/** @type {string} */
let extPkgDir;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `tui-test-${Math.random().toString(36).slice(2)}`);
    extPkgDir = path.join(dir, 'fixture-ext');
    await fs.mkdir(extPkgDir, { recursive: true });
    await fs.writeFile(path.join(extPkgDir, 'package.json'), JSON.stringify({ name: 'fixture-ext', type: 'module', main: 'index.js' }));
    await fs.writeFile(
        path.join(extPkgDir, 'index.js'),
        `export const manifest = { name: 'fixture', description: 'Fixture' };
export const setup = { devDependencies: { 'fix-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fix-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fix-pkg']);
}
`
    );
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('getOptionsValue', () => {
    test('collects initial values from flat options', () => {
        const state = getOptionsValue([
            { title: 'Name', field: 'name', initialValue: 'x' },
            { title: 'Flag', field: 'flag', type: 'toggle', initialValue: true },
        ]);
        assert.deepStrictEqual(state, { name: 'x', flag: true });
    });

    test('flattens inner objects when mutateInnerObject is false', () => {
        const state = getOptionsValue([
            {
                title: 'Group',
                field: 'group',
                mutateInnerObject: false,
                items: [{ title: 'A', field: 'a', initialValue: '1' }],
            },
        ]);
        assert.deepStrictEqual(state, { a: '1' });
    });

    test('nests inner object when mutateInnerObject is true', () => {
        const state = getOptionsValue([
            {
                title: 'Group',
                field: 'group',
                mutateInnerObject: true,
                items: [{ title: 'A', field: 'a', initialValue: '1' }],
            },
        ]);
        assert.deepStrictEqual(state, { group: { a: '1' } });
    });
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
        assert.strictEqual(cfg.type, 'multiselect');
        const choices = /** @type {any[]} */ (cfg.choices);
        assert.strictEqual(choices.length, 2);
        assert.strictEqual(choices[1].selected, true);
        assert.strictEqual(choices[0].selected, false);
    });

    test('select resolves initial index from value', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'select', list: ['a', 'b', 'c'] }, { f: 'c' });
        assert.strictEqual(cfg.initial, 2);
    });
});

describe('buildExtensionMenuItems', () => {
    test('reports unresolved extensions as error items, not crashing', async () => {
        const items = await buildExtensionMenuItems([{ name: 'missing', package: '@nonexistent/pkg-xyz', description: 'x' }], dir);
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].ext, null);
        assert.match(/** @type {string} */ (items[0].error), /Cannot resolve/);
        assert.strictEqual(items[0].installed, false);
        assert.strictEqual(items[0].intent, null);
    });

    test('computes installed=false when detect returns false', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
        const items = await buildExtensionMenuItems([{ name: 'fixture', package: './fixture-ext/index.js', description: 'fix' }], dir);
        assert.strictEqual(items.length, 1);
        assert.ok(items[0].ext);
        assert.strictEqual(items[0].installed, false);
        assert.strictEqual(items[0].error, null);
    });

    test('computes installed=true when extension dep already present', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', devDependencies: { 'fix-pkg': '^1.0.0' } }));
        const items = await buildExtensionMenuItems([{ name: 'fixture', package: './fixture-ext/index.js', description: 'fix' }], dir);
        assert.strictEqual(items[0].installed, true);
    });
});

describe('toggleExtensionIntent', () => {
    test('not installed → setup, then clear', () => {
        const item = /** @type {any} */ ({ installed: false, intent: null, options: {} });
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, 'setup');
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, null);
    });

    test('installed → remove, then clear', () => {
        const item = /** @type {any} */ ({ installed: true, intent: null, options: {} });
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, 'remove');
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, null);
    });

    test('clearing intent also wipes options', () => {
        const item = /** @type {any} */ ({ installed: false, intent: 'setup', options: { x: 1 } });
        toggleExtensionIntent(item);
        assert.deepStrictEqual(item.options, {});
    });
});
