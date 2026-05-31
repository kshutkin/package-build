import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import prompts from 'prompts';

import { runRemove, runSetup } from '../src/engine.js';
import { loadRegistry } from '../src/registry.js';
import { Tree } from '../src/tree.js';
import { buildExtensionMenuItems, done, runInteractiveLoop, toggleExtensionIntent } from '../src/tui.js';

/** @type {string} */
let dir;

/**
 * @param {string} root
 * @param {string} name
 * @param {string} body
 */
async function writeExtension(root, name, body) {
    const extDir = path.join(root, name);
    await fs.mkdir(extDir, { recursive: true });
    await fs.writeFile(path.join(extDir, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }));
    await fs.writeFile(path.join(extDir, 'index.js'), body);
    return extDir;
}

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `tui-flow-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'host', version: '0.0.1' }, null, 2)}\n`);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('buildExtensionMenuItems initial status', () => {
    test('detect=false → Not installed; detect=true (artifacts present) → Installed', async () => {
        await writeExtension(
            dir,
            'fx-a',
            `export const manifest = { name: 'fx-a', description: 'A' };
export const setup = { devDependencies: { 'fx-a-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fx-a-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fx-a-pkg']);
}
`
        );
        await writeExtension(
            dir,
            'fx-b',
            `export const manifest = { name: 'fx-b', description: 'B' };
export const setup = { devDependencies: { 'fx-b-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fx-b-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fx-b-pkg']);
}
`
        );
        // host already depends on fx-b-pkg → fx-b should be Installed
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', version: '0.0.1', devDependencies: { 'fx-b-pkg': '^1.0.0' } }, null, 2)}\n`
        );

        const items = await buildExtensionMenuItems(
            [
                { name: 'fx-a', package: './fx-a/index.js', description: 'A' },
                { name: 'fx-b', package: './fx-b/index.js', description: 'B' },
            ],
            dir
        );
        assert.strictEqual(items.length, 2);
        const a = /** @type {any} */ (items.find(i => i.entry.name === 'fx-a'));
        const b = /** @type {any} */ (items.find(i => i.entry.name === 'fx-b'));
        assert.strictEqual(a.installed, false);
        assert.strictEqual(a.error, null);
        assert.strictEqual(b.installed, true);
        assert.strictEqual(b.error, null);
    });
});

describe('toggleExtensionIntent round-trips', () => {
    test('not-installed → pending setup → cleared', () => {
        const item = /** @type {any} */ ({ installed: false, intent: null, options: {} });
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, 'setup');
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, null);
    });

    test('installed → pending remove', () => {
        const item = /** @type {any} */ ({ installed: true, intent: null, options: {} });
        toggleExtensionIntent(item);
        assert.strictEqual(item.intent, 'remove');
    });
});

describe('runInteractiveLoop via prompts.inject', () => {
    test('selecting an unavailable extension is a no-op (no crash, intent stays null)', async () => {
        await fs.writeFile(
            path.join(dir, '.pkgbld-extensions.json'),
            JSON.stringify({ extensions: [{ name: 'ghost', package: '@nonexistent/ghost-pkg-xyz', description: 'g' }] })
        );
        const registry = await loadRegistry(path.resolve('extensions.json'), dir);
        const items = await buildExtensionMenuItems(
            registry.filter(e => e.name === 'ghost'),
            dir
        );
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].ext, null);
        assert.match(/** @type {string} */ (items[0].error), /Cannot resolve/);

        // suppress the "Extension ... is unavailable" log
        const origLog = console.log;
        console.log = () => {};
        try {
            prompts.inject(['__ext__:ghost', done]);
            await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'create', projectRoot: dir });
        } finally {
            console.log = origLog;
        }
        assert.strictEqual(items[0].intent, null);
    });

    test('toggling a not-installed extension sets intent=setup, second toggle clears it', async () => {
        await writeExtension(
            dir,
            'fx',
            `export const manifest = { name: 'fx', description: 'X' };
export const setup = { devDependencies: { 'fx-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fx-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fx-pkg']);
}
`
        );
        const items = await buildExtensionMenuItems([{ name: 'fx', package: './fx/index.js', description: 'X' }], dir);
        assert.strictEqual(items[0].installed, false);

        prompts.inject(['__ext__:fx', done]);
        await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'create', projectRoot: dir });
        assert.strictEqual(items[0].intent, 'setup');

        prompts.inject(['__ext__:fx', done]);
        await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'create', projectRoot: dir });
        assert.strictEqual(items[0].intent, null);
    });

    test('toggling an installed extension sets intent=remove', async () => {
        await writeExtension(
            dir,
            'fx',
            `export const manifest = { name: 'fx', description: 'X' };
export const setup = { devDependencies: { 'fx-pkg': '^1.0.0' } };
export const remove = { devDependencies: ['fx-pkg'] };
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fx-pkg']);
}
`
        );
        await fs.writeFile(
            path.join(dir, 'package.json'),
            `${JSON.stringify({ name: 'host', version: '0.0.1', devDependencies: { 'fx-pkg': '^1.0.0' } }, null, 2)}\n`
        );
        const items = await buildExtensionMenuItems([{ name: 'fx', package: './fx/index.js', description: 'X' }], dir);
        assert.strictEqual(items[0].installed, true);

        prompts.inject(['__ext__:fx', done]);
        await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'update', projectRoot: dir });
        assert.strictEqual(items[0].intent, 'remove');
    });

    test('full flow: select extension → commit setup writes files to disk', async () => {
        await writeExtension(
            dir,
            'fx',
            `export const manifest = { name: 'fx', description: 'X' };
export const setup = {
    devDependencies: { 'fx-pkg': '^1.0.0' },
    scripts: { 'fx:run': 'fx run' },
    files: { 'fx.config.json': 'inline:{"ok":true}\\n' },
};
export const remove = {
    devDependencies: ['fx-pkg'],
    scripts: ['fx:run'],
    files: ['fx.config.json'],
};
export function detect(tree) {
    const pkg = tree.readJson('package.json');
    return Boolean(pkg && pkg.devDependencies && pkg.devDependencies['fx-pkg']);
}
`
        );
        const items = await buildExtensionMenuItems([{ name: 'fx', package: './fx/index.js', description: 'X' }], dir);

        prompts.inject(['__ext__:fx', done]);
        await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'create', projectRoot: dir });
        assert.strictEqual(items[0].intent, 'setup');

        // Replicate the commit sequence from index.js
        const tree = new Tree(dir);
        for (const item of items) {
            if (!item.intent || !item.ext) continue;
            if (item.intent === 'setup') await runSetup(/** @type {any} */ (item.ext), tree, item.options);
            else await runRemove(/** @type {any} */ (item.ext), tree, item.options);
        }
        await tree.commit();

        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual(pkg.devDependencies['fx-pkg'], '^1.0.0');
        assert.strictEqual(pkg.scripts['fx:run'], 'fx run');
        const cfg = await fs.readFile(path.join(dir, 'fx.config.json'), 'utf8');
        assert.strictEqual(cfg, '{"ok":true}\n');
    });

    test('extension prompts(): injected answers collected and passed to setup', async () => {
        await writeExtension(
            dir,
            'fx',
            `export const manifest = { name: 'fx', description: 'X' };
export function prompts() {
    return [{ title: 'Greeting', field: 'greeting', initialValue: 'hi' }];
}
export async function setup(tree, options) {
    tree.write('greeting.txt', String(options.greeting));
}
export function detect() { return false; }
`
        );
        const items = await buildExtensionMenuItems([{ name: 'fx', package: './fx/index.js', description: 'X' }], dir);

        // sequence: top-level select fx → ext prompt answer → top-level select done
        prompts.inject(['__ext__:fx', 'hello-world', done]);
        await runInteractiveLoop({ options: [], state: {}, extensionItems: items, mode: 'create', projectRoot: dir });

        assert.strictEqual(items[0].intent, 'setup');
        assert.strictEqual(items[0].options.greeting, 'hello-world');

        const tree = new Tree(dir);
        for (const item of items) {
            if (!item.intent || !item.ext) continue;
            await runSetup(/** @type {any} */ (item.ext), tree, item.options);
        }
        await tree.commit();
        const txt = await fs.readFile(path.join(dir, 'greeting.txt'), 'utf8');
        assert.strictEqual(txt, 'hello-world');
    });
});
