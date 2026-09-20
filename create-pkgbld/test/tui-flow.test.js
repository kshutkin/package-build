import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import prompts from 'prompts';

import { buildPackageInventory } from '../src/inventory.js';
import { applyPackageIntent } from '../src/package-operations.js';
import { Tree } from '../src/tree.js';
import { done, runInteractiveLoop } from '../src/tui.js';

/** @type {string} */
let dir;
const packageName = 'create-pkgbld-extension-fixture';
const entry = { name: 'fixture', package: packageName, version: '^1.0.0', description: 'Fixture', official: true };

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tui-flow-test-'));
    const extDir = path.join(dir, 'node_modules', packageName);
    await fs.mkdir(extDir, { recursive: true });
    await fs.writeFile(
        path.join(extDir, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.2.3', type: 'module', main: 'index.js' })
    );
    await fs.writeFile(
        path.join(extDir, 'index.js'),
        `export const manifest = { name: 'fixture', description: 'Fixture' };
export const setup = {
    devDependencies: { 'fixture-tool': '^1.0.0' },
    files: { 'fixture.config.json': 'inline:{"ok":true}\\n' },
};
export const remove = { devDependencies: ['fixture-tool'], files: ['fixture.config.json'] };
export function prompts() { return [{ title: 'Greeting', field: 'greeting', initialValue: 'hi' }]; }
export function detect(tree) { return Boolean(tree.readJson('package.json')?.devDependencies?.['fixture-tool']); }
`
    );
    await fs.writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'host', version: '0.0.1' }, null, 2)}\n`);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('interactive package management', () => {
    test('selecting an available extension collects options and stages setup', async () => {
        const items = await buildPackageInventory([entry], dir);
        prompts.inject(['__ext__:fixture', 'hello', done]);
        await runInteractiveLoop({ extensionItems: items, projectRoot: dir });
        assert.strictEqual(items[0].intent, 'setup');
        assert.strictEqual(items[0].options.greeting, 'hello');

        const tree = new Tree(dir);
        await applyPackageIntent(items[0], tree, dir);
        await tree.commit();
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies['fixture-tool'], '^1.0.0');
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(lock.packages[packageName], '1.2.3');
    });

    test('an unmanaged detected extension offers explicit adoption', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', devDependencies: { 'fixture-tool': '^1.0.0' } }, null, 2)}\n`
        );
        const items = await buildPackageInventory([entry], dir);
        assert.strictEqual(items[0].state, 'installed-unmanaged');
        prompts.inject(['__ext__:fixture', 'adopt', done]);
        await runInteractiveLoop({ extensionItems: items, projectRoot: dir });
        assert.strictEqual(items[0].intent, 'adopt');
    });

    test('an unmanaged detected extension can be removed instead', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', devDependencies: { 'fixture-tool': '^1.0.0' } }, null, 2)}\n`
        );
        const items = await buildPackageInventory([entry], dir);
        prompts.inject(['__ext__:fixture', 'remove', done]);
        await runInteractiveLoop({ extensionItems: items, projectRoot: dir });
        assert.strictEqual(items[0].intent, 'remove');
    });
});
