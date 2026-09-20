import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { getExtensionCacheSlot, getPackageName, installCachedExtension } from '../src/extension-cache.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-pkgbld-cache-test-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('extension cache', () => {
    test('extracts unscoped and scoped package names while preserving subpaths', () => {
        assert.equal(getPackageName('extension-name'), 'extension-name');
        assert.equal(getPackageName('extension-name/contract'), 'extension-name');
        assert.equal(getPackageName('@author/extension-name'), '@author/extension-name');
        assert.equal(getPackageName('@author/extension-name/contract'), '@author/extension-name');
        assert.equal(getPackageName('./local-extension.js'), null);
    });

    test('installs package metadata once and reuses the matching cached version', async () => {
        const calls = [];
        const runner = async (command, args, cwd) => {
            calls.push({ command, args, cwd });
            const packageDir = path.join(cwd, 'node_modules/@author/create-pkgbld-extension-demo');
            await fs.mkdir(packageDir, { recursive: true });
            await fs.writeFile(
                path.join(packageDir, 'package.json'),
                JSON.stringify({ name: '@author/create-pkgbld-extension-demo', version: '1.2.4' })
            );
            return 0;
        };
        const entry = { package: '@author/create-pkgbld-extension-demo/contract', version: '^1.2.0' };
        const resolveVersion = async () => '1.2.4';
        await installCachedExtension(entry, dir, runner, resolveVersion);
        await installCachedExtension(entry, dir, runner, resolveVersion);

        assert.equal(calls.length, 1);
        assert.equal(calls[0].command, 'npm');
        assert.deepEqual(calls[0].args, ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
        const slot = getExtensionCacheSlot('@author/create-pkgbld-extension-demo', '1.2.4', dir);
        assert.equal(calls[0].cwd, slot);
        const manifest = JSON.parse(await fs.readFile(path.join(slot, 'package.json'), 'utf8'));
        assert.equal(manifest.private, true);
        assert.equal(manifest.dependencies['@author/create-pkgbld-extension-demo'], '1.2.4');
    });

    test('reports a failed cache install', async () => {
        await assert.rejects(
            installCachedExtension({ package: 'create-pkgbld-extension-demo', version: '1.0.0' }, dir, async () => 7),
            /npm install exited with code 7/
        );
        const manifest = JSON.parse(
            await fs.readFile(path.join(getExtensionCacheSlot('create-pkgbld-extension-demo', '1.0.0', dir), 'package.json'), 'utf8')
        );
        assert.equal(manifest.dependencies['create-pkgbld-extension-demo'], undefined);
    });

    test('repairs an exact-version cache entry when installed code has another version', async () => {
        const packageName = 'create-pkgbld-extension-demo';
        const slot = getExtensionCacheSlot(packageName, '1.0.0', dir);
        const packageDir = path.join(slot, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: packageName, version: '2.0.0' }));
        await fs.writeFile(path.join(slot, 'package.json'), JSON.stringify({ private: true, dependencies: { [packageName]: '1.0.0' } }));
        let calls = 0;
        await installCachedExtension({ package: packageName, version: '1.0.0' }, dir, async () => {
            calls += 1;
            await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }));
            return 0;
        });
        assert.strictEqual(calls, 1);
    });
});
