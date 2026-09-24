import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { LOCK_FILE, LOCK_SCHEMA, readProjectLock, removeLockedPackage, setLockedPackage } from '../src/project-lock.js';
import { Tree } from '../src/tree.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-lock-test-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('project lock', () => {
    test('missing lock is empty state', async () => {
        assert.strictEqual(await readProjectLock(dir), null);
    });

    test('writes exact versions with stable package ordering', async () => {
        const tree = new Tree(dir);
        setLockedPackage(tree, 'pkgbld-plugin-z', '2.0.0');
        setLockedPackage(tree, '@author/pkgbld-plugin-a', '1.2.3');
        await tree.commit();
        const lock = JSON.parse(await fs.readFile(path.join(dir, LOCK_FILE), 'utf8'));
        assert.strictEqual(lock.$schema, LOCK_SCHEMA);
        assert.deepStrictEqual(Object.keys(lock.packages), ['@author/pkgbld-plugin-a', 'pkgbld-plugin-z']);
    });

    test('removing the final entry keeps a valid empty lock', async () => {
        await fs.writeFile(
            path.join(dir, LOCK_FILE),
            `${JSON.stringify({ $schema: LOCK_SCHEMA, packages: { 'create-pkgbld-extension-a': '1.0.0' } }, null, 2)}\n`
        );
        const tree = new Tree(dir);
        removeLockedPackage(tree, 'create-pkgbld-extension-a');
        await tree.commit();
        assert.deepStrictEqual((await readProjectLock(dir))?.packages, {});
    });

    test('rejects ranges and unsupported package names', async () => {
        await fs.writeFile(path.join(dir, LOCK_FILE), JSON.stringify({ $schema: LOCK_SCHEMA, packages: { 'pkgbld-plugin-a': '^1.0.0' } }));
        await assert.rejects(() => readProjectLock(dir), /exact version/);
        await fs.writeFile(path.join(dir, LOCK_FILE), JSON.stringify({ $schema: LOCK_SCHEMA, packages: { biome: '1.0.0' } }));
        await assert.rejects(() => readProjectLock(dir), /unsupported package name/);
    });
});
