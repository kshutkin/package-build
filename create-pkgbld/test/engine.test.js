import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { detectExtension, runRemove, runSetup } from '../src/engine.js';
import { Tree } from '../src/tree.js';

/** @type {string} */
let dir;
/** @type {string} */
let extDir;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `engine-test-${Math.random().toString(36).slice(2)}`);
    extDir = path.join(dir, '_ext');
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(extDir, { recursive: true });
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('runSetup (declarative)', () => {
    test('applies dependencies, scripts, files (template + inline), packageJson merge', async () => {
        await fs.writeFile(path.join(extDir, 'tpl.json'), '{"hello":true}\n');
        const tree = new Tree(dir);
        const ext = {
            manifest: { name: 'x', description: 'X' },
            __baseDir: extDir,
            setup: {
                dependencies: { foo: '^1.0.0' },
                devDependencies: { bar: '^2.0.0' },
                scripts: { lint: 'lint .' },
                files: {
                    'config.json': './tpl.json',
                    'README.md': 'inline:# hello\n',
                },
                packageJson: { type: 'module' },
            },
        };
        await runSetup(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.strictEqual(pkg.dependencies.foo, '^1.0.0');
        assert.strictEqual(pkg.devDependencies.bar, '^2.0.0');
        assert.strictEqual(pkg.scripts.lint, 'lint .');
        assert.strictEqual(pkg.type, 'module');
        assert.strictEqual(tree.read('config.json'), '{"hello":true}\n');
        assert.strictEqual(tree.read('README.md'), '# hello\n');
    });
});

describe('runRemove (declarative)', () => {
    test('removes deps/scripts/files', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({
                dependencies: { foo: '1' },
                devDependencies: { bar: '2' },
                scripts: { lint: 'x' },
            })
        );
        await fs.writeFile(path.join(dir, 'gone.txt'), 'bye');
        const tree = new Tree(dir);
        const ext = {
            manifest: { name: 'x', description: 'X' },
            remove: {
                dependencies: ['foo'],
                devDependencies: ['bar'],
                scripts: ['lint'],
                files: ['gone.txt'],
            },
        };
        await runRemove(ext, tree);
        const pkg = tree.readJson('package.json');
        assert.strictEqual(pkg.dependencies?.foo, undefined);
        assert.strictEqual(pkg.devDependencies?.bar, undefined);
        assert.strictEqual(pkg.scripts?.lint, undefined);
        assert.ok(tree.listChanges().some(c => c.path === 'gone.txt' && c.type === 'DELETE'));
    });
});

describe('programmatic setup/remove', () => {
    test('setup fn is invoked with tree and options', async () => {
        const tree = new Tree(dir);
        let called = false;
        const ext = {
            manifest: { name: 'p', description: 'P' },
            __baseDir: extDir,
            setup: async (t, opts) => {
                called = true;
                assert.strictEqual(opts.foo, 'bar');
                t.write('hi.txt', 'hi');
            },
        };
        await runSetup(ext, tree, { foo: 'bar' });
        assert.ok(called);
        assert.strictEqual(tree.read('hi.txt'), 'hi');
    });

    test('remove fn is invoked', async () => {
        const tree = new Tree(dir);
        let called = false;
        const ext = {
            manifest: { name: 'p', description: 'P' },
            remove: async () => {
                called = true;
            },
        };
        await runRemove(ext, tree);
        assert.ok(called);
    });
});

describe('detectExtension', () => {
    test('returns false when detect is not provided', () => {
        const tree = new Tree(dir);
        assert.strictEqual(detectExtension({ manifest: { name: 'x', description: 'X' } }, tree), false);
    });

    test('returns result of detect()', () => {
        const tree = new Tree(dir);
        assert.strictEqual(detectExtension({ manifest: { name: 'x', description: 'X' }, detect: () => true }, tree), true);
        assert.strictEqual(detectExtension({ manifest: { name: 'x', description: 'X' }, detect: () => false }, tree), false);
    });
});
