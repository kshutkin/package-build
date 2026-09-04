import assert from 'node:assert';
import test, { describe } from 'node:test';

import { detectConflicts, recordOps } from '../src/conflicts.js';
import { Tree } from '../src/tree.js';

describe('detectConflicts', () => {
    test('returns empty for non-conflicting ops', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'write', path: 'x', value: 'hi' },
            { source: 'a', kind: 'dependency', key: 'foo', value: '1' },
        ]);
        assert.deepStrictEqual(c, []);
    });

    test('flags two writes with different content to same path', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'write', path: 'p', value: '1' },
            { source: 'b', kind: 'write', path: 'p', value: '2' },
        ]);
        assert.strictEqual(c.length, 1);
        assert.strictEqual(c[0].kind, 'write-conflict');
        assert.deepStrictEqual(c[0].sources.sort(), ['a', 'b']);
    });

    test('does NOT flag two writes with identical content', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'write', path: 'p', value: 'same' },
            { source: 'b', kind: 'write', path: 'p', value: 'same' },
        ]);
        assert.deepStrictEqual(c, []);
    });

    test('flags write vs delete on the same path', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'write', path: 'p', value: 'x' },
            { source: 'b', kind: 'delete', path: 'p' },
        ]);
        assert.ok(c.some(x => x.kind === 'write-vs-delete'));
    });

    test('flags two different dependency versions', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'dependency', key: 'foo', value: '^1.0.0' },
            { source: 'b', kind: 'dependency', key: 'foo', value: '^2.0.0' },
        ]);
        assert.strictEqual(c.length, 1);
        assert.strictEqual(c[0].kind, 'dependency-version');
    });

    test('flags two different script values', () => {
        const c = detectConflicts([
            { source: 'a', kind: 'script', key: 'lint', value: 'eslint .' },
            { source: 'b', kind: 'script', key: 'lint', value: 'biome check' },
        ]);
        assert.strictEqual(c.length, 1);
        assert.strictEqual(c[0].kind, 'script-value');
    });
});

describe('recordOps', () => {
    test('captures Tree write/delete/addDependency/addScript ops', async () => {
        const tree = new Tree(process.cwd());
        const { ops } = await recordOps(tree, 'ext-x', async () => {
            tree.write('a.txt', 'hi');
            tree.addDependency('foo', '^1.0.0', 'devDependencies');
            tree.addScript('lint', 'do lint');
            tree.delete('b.txt');
        });
        const kinds = ops.map(o => o.kind).sort();
        assert.deepStrictEqual(kinds, ['delete', 'dependency', 'script', 'write']);
        for (const op of ops) assert.strictEqual(op.source, 'ext-x');
    });

    test('further calls after run are not recorded', async () => {
        const tree = new Tree(process.cwd());
        const { ops } = await recordOps(tree, 'x', async () => {
            tree.write('a.txt', 'first');
        });
        tree.write('b.txt', 'after');
        assert.strictEqual(ops.length, 1);
        assert.strictEqual(ops[0].path, 'a.txt');
    });
});
