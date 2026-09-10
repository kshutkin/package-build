import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { Tree } from '../src/tree.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), `tree-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('Tree core ops', () => {
    test('read returns null for missing file', () => {
        const tree = new Tree(dir);
        assert.strictEqual(tree.read('nope.txt'), null);
        assert.strictEqual(tree.exists('nope.txt'), false);
    });

    test('read loads existing file from disk', async () => {
        await fs.writeFile(path.join(dir, 'a.txt'), 'hello');
        const tree = new Tree(dir);
        assert.strictEqual(tree.read('a.txt'), 'hello');
        assert.strictEqual(tree.exists('a.txt'), true);
    });

    test('write new path produces CREATE; write to read path produces UPDATE', async () => {
        await fs.writeFile(path.join(dir, 'a.txt'), 'old');
        const tree = new Tree(dir);
        tree.read('a.txt');
        tree.write('a.txt', 'new');
        tree.write('b.txt', 'fresh');
        const changes = tree.listChanges();
        const byPath = Object.fromEntries(changes.map(c => [c.path, c.type]));
        assert.strictEqual(byPath['a.txt'], 'UPDATE');
        assert.strictEqual(byPath['b.txt'], 'CREATE');
    });

    test('delete existing file produces DELETE', async () => {
        await fs.writeFile(path.join(dir, 'a.txt'), 'old');
        const tree = new Tree(dir);
        tree.delete('a.txt');
        const changes = tree.listChanges();
        assert.deepStrictEqual(changes, [{ path: 'a.txt', type: 'DELETE' }]);
        assert.strictEqual(tree.exists('a.txt'), false);
    });

    test('delete of just-written (new) file cancels the CREATE', () => {
        const tree = new Tree(dir);
        tree.write('a.txt', 'hi');
        tree.delete('a.txt');
        assert.deepStrictEqual(tree.listChanges(), []);
    });

    test('rename moves content from old to new path', async () => {
        await fs.writeFile(path.join(dir, 'a.txt'), 'hello');
        const tree = new Tree(dir);
        tree.rename('a.txt', 'b.txt');
        assert.strictEqual(tree.read('b.txt'), 'hello');
        assert.strictEqual(tree.exists('a.txt'), false);
        const types = tree
            .listChanges()
            .map(c => `${c.path}:${c.type}`)
            .sort();
        assert.deepStrictEqual(types, ['a.txt:DELETE', 'b.txt:CREATE']);
    });
});

describe('Tree JSON + package helpers', () => {
    test('readJson / updateJson round-trip', async () => {
        await fs.writeFile(path.join(dir, 'x.json'), JSON.stringify({ a: 1 }));
        const tree = new Tree(dir);
        assert.deepStrictEqual(tree.readJson('x.json'), { a: 1 });
        tree.updateJson('x.json', d => {
            d.b = 2;
            return d;
        });
        assert.deepStrictEqual(tree.readJson('x.json'), { a: 1, b: 2 });
    });

    test('addDependency / addScript writes package.json', () => {
        const tree = new Tree(dir);
        tree.addDependency('foo', '^1.0.0', 'devDependencies');
        tree.addScript('lint', 'biome check');
        const pkg = tree.readJson('package.json');
        assert.strictEqual(pkg.devDependencies.foo, '^1.0.0');
        assert.strictEqual(pkg.scripts.lint, 'biome check');
    });

    test('removeDependency / removeScript', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ dependencies: { foo: '1', keep: '2' }, scripts: { lint: 'x', test: 'y' } })
        );
        const tree = new Tree(dir);
        tree.removeDependency('foo', 'dependencies');
        tree.removeScript('lint');
        const pkg = tree.readJson('package.json');
        assert.strictEqual(pkg.dependencies.foo, undefined);
        assert.strictEqual(pkg.scripts.lint, undefined);
        assert.strictEqual(pkg.dependencies.keep, '2');
        assert.strictEqual(pkg.scripts.test, 'y');
    });
});

describe('Tree commit', () => {
    test('writes CREATE/UPDATE files and unlinks DELETE files', async () => {
        await fs.writeFile(path.join(dir, 'a.txt'), 'old');
        await fs.writeFile(path.join(dir, 'kill.txt'), 'bye');
        const tree = new Tree(dir);
        tree.write('a.txt', 'new');
        tree.write('nested/deep/file.txt', 'created');
        tree.delete('kill.txt');
        await tree.commit();
        assert.strictEqual(await fs.readFile(path.join(dir, 'a.txt'), 'utf8'), 'new');
        assert.strictEqual(await fs.readFile(path.join(dir, 'nested/deep/file.txt'), 'utf8'), 'created');
        await assert.rejects(fs.access(path.join(dir, 'kill.txt')));
    });

    test('package.json is written with toFormattedJson (trailing newline)', async () => {
        const tree = new Tree(dir);
        tree.addDependency('foo', '1');
        await tree.commit();
        const content = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
        assert.ok(content.endsWith('\n'));
        assert.deepStrictEqual(JSON.parse(content), { dependencies: { foo: '1' } });
    });

    test('resolveExtensionFile resolves relative to set base', () => {
        const tree = new Tree(dir);
        tree.setExtensionBase('/ext/root');
        assert.strictEqual(tree.resolveExtensionFile('./templates/x.json'), path.resolve('/ext/root', './templates/x.json'));
    });

    test('resolveExtensionFile throws when base not set', () => {
        const tree = new Tree(dir);
        assert.throws(() => tree.resolveExtensionFile('./x'), /extension base/);
    });
});

describe('Tree no-op + traversal guards', () => {
    test('delete on non-existent path produces no change', () => {
        const tree = new Tree(dir);
        tree.delete('nope.txt');
        assert.deepStrictEqual(tree.listChanges(), []);
    });

    test('delete after read-miss produces no change', () => {
        const tree = new Tree(dir);
        tree.read('nope.txt');
        tree.delete('nope.txt');
        assert.deepStrictEqual(tree.listChanges(), []);
    });

    test('updateJson with identical content produces no change', async () => {
        const original = `${JSON.stringify({ a: 1, b: 2 }, null, 2)}\n`;
        await fs.writeFile(path.join(dir, 'x.json'), original);
        const tree = new Tree(dir);
        tree.updateJson('x.json', d => d);
        assert.deepStrictEqual(tree.listChanges(), []);
    });

    test('removeDependency that empties parent removes the parent key', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', devDependencies: { foo: '1' } }));
        const tree = new Tree(dir);
        tree.removeDependency('foo', 'devDependencies');
        await tree.commit();
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual('devDependencies' in pkg, false);
        assert.strictEqual(pkg.name, 'p');
    });

    test('removeScript that empties parent removes the scripts key', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', scripts: { lint: 'x' } }));
        const tree = new Tree(dir);
        tree.removeScript('lint');
        await tree.commit();
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.strictEqual('scripts' in pkg, false);
    });

    test('removeDependency keeps parent when other entries remain', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { foo: '1', bar: '2' } }));
        const tree = new Tree(dir);
        tree.removeDependency('foo', 'devDependencies');
        await tree.commit();
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.deepStrictEqual(pkg.devDependencies, { bar: '2' });
    });

    test('write/delete reject path that escapes project root', () => {
        const tree = new Tree(dir);
        assert.throws(() => tree.write('../escape.txt', 'x'), /escapes project root/);
        assert.throws(() => tree.delete('../escape.txt'), /escapes project root/);
        assert.throws(() => tree.read('../escape.txt'), /escapes project root/);
    });

    test('commit allows nested paths inside the root', async () => {
        const tree = new Tree(dir);
        tree.write('a/b/c.txt', 'ok');
        await tree.commit();
        assert.strictEqual(await fs.readFile(path.join(dir, 'a/b/c.txt'), 'utf8'), 'ok');
    });

    test('absolute path inside the root works; outside throws', () => {
        const tree = new Tree(dir);
        const inside = path.join(dir, 'inner.txt');
        assert.doesNotThrow(() => tree.write(inside, 'hi'));
        assert.throws(() => tree.write('/tmp/definitely-outside-pkgbld-root.txt', 'x'), /escapes project root/);
    });
});
