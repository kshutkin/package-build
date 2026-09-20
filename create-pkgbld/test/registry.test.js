import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { loadRegistry } from '../src/registry.js';

/** @type {string} */
let dir;
/** @type {string} */
let builtinPath;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `reg-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    builtinPath = path.join(dir, 'extensions.json');
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('loadRegistry', () => {
    test('loads built-in registry', async () => {
        await fs.writeFile(builtinPath, JSON.stringify({ extensions: [{ name: 'a', package: 'pkg-a', description: 'A' }] }));
        const entries = await loadRegistry(builtinPath);
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].name, 'a');
        assert.strictEqual(entries[0].official, true);
    });

    test('does not read the removed project registry file', async () => {
        await fs.writeFile(
            builtinPath,
            JSON.stringify({
                extensions: [
                    { name: 'a', package: 'builtin-a', description: 'builtin A' },
                    { name: 'b', package: 'builtin-b', description: 'builtin B' },
                ],
            })
        );
        await fs.writeFile(
            path.join(dir, '.pkgbld-extensions.json'),
            JSON.stringify({
                extensions: [
                    { name: 'a', package: 'local-a', description: 'local A' },
                    { name: 'c', package: 'local-c', description: 'local C' },
                ],
            })
        );
        const entries = await loadRegistry(builtinPath);
        const byName = Object.fromEntries(entries.map(e => [e.name, e.package]));
        assert.strictEqual(byName.a, 'builtin-a');
        assert.strictEqual(byName.b, 'builtin-b');
        assert.strictEqual(byName.c, undefined);
        assert.strictEqual(entries.find(entry => entry.name === 'a').official, true);
        assert.strictEqual(entries.find(entry => entry.name === 'b').official, true);
    });

    test('marks a custom primary registry as unofficial', async () => {
        await fs.writeFile(builtinPath, JSON.stringify({ extensions: [{ name: 'a', package: 'pkg-a', description: 'A' }] }));
        const entries = await loadRegistry(builtinPath, false);
        assert.strictEqual(entries[0].official, false);
    });

    test('accepts an empty built-in registry', async () => {
        await fs.writeFile(builtinPath, JSON.stringify({ extensions: [] }));
        const entries = await loadRegistry(builtinPath);
        assert.deepStrictEqual(entries, []);
    });
});
