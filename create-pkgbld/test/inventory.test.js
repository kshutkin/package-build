import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { buildPackageInventory } from '../src/inventory.js';
import { LOCK_SCHEMA } from '../src/project-lock.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('package inventory', () => {
    test('merges a registered plugin, lock entry, and repeated dependency declarations', async () => {
        const packageName = '@author/pkgbld-plugin-example';
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ dependencies: { [packageName]: '1.2.3' }, peerDependencies: { [packageName]: '^1.0.0' } })
        );
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.2.3' } })
        );
        const [item] = await buildPackageInventory(
            [{ name: 'example', package: `${packageName}/extension`, version: '^1.0.0', description: 'Example', official: true }],
            dir
        );
        assert.strictEqual(item.entry.name, 'example');
        assert.strictEqual(item.packageName, packageName);
        assert.strictEqual(item.state, 'installed-managed');
        assert.deepStrictEqual(item.dependencyFields, ['dependencies', 'peerDependencies']);
    });

    test('synthesizes only correctly named dependency plugins', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({
                devDependencies: {
                    'pkgbld-plugin-one': '^1.0.0',
                    '@scope/pkgbld-plugin-two': '^2.0.0',
                    'create-pkgbld-extension-hidden': '^1.0.0',
                    biome: '^2.0.0',
                },
            })
        );
        const items = await buildPackageInventory([], dir);
        assert.deepStrictEqual(
            items.map(item => item.packageName),
            ['@scope/pkgbld-plugin-two', 'pkgbld-plugin-one']
        );
        assert.ok(items.every(item => item.state === 'installed-unmanaged'));
    });

    test('shows a locked extension without cached code as applied', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { 'create-pkgbld-extension-missing': '1.2.3' } })
        );
        const [item] = await buildPackageInventory([], dir);
        assert.strictEqual(item.state, 'applied');
        assert.strictEqual(item.lockedVersion, '1.2.3');
    });

    test('does not execute a cached extension whose version differs from the lock', async () => {
        const packageName = 'create-pkgbld-extension-example';
        const packageDir = path.join(dir, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '2.0.0', type: 'module', main: 'index.js' })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), `throw new Error('wrong extension version executed');`);
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const [item] = await buildPackageInventory(
            [{ name: 'example', package: packageName, version: '^2.0.0', description: 'Example', official: true }],
            dir
        );
        assert.strictEqual(item.state, 'applied');
        assert.strictEqual(item.ext, null);
    });

    test('does not import lock-only third-party extension code while listing', async () => {
        const packageName = '@author/create-pkgbld-extension-example';
        const packageDir = path.join(dir, 'node_modules', '@author', 'create-pkgbld-extension-example');
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.0.0', type: 'module', main: 'index.js' })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), `throw new Error('extension code executed during listing');`);
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const [item] = await buildPackageInventory([], dir);
        assert.strictEqual(item.state, 'applied');
        assert.strictEqual(item.ext, null);
    });
});
