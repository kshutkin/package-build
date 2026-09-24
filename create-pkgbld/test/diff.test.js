import assert from 'node:assert';
import test, { describe } from 'node:test';

import { renderChanges } from '../src/diff.js';

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const stripAnsi = (/** @type {string} */ s) => s.replace(ANSI_RE, '');

describe('renderChanges', () => {
    test('returns (no changes) for empty list', () => {
        assert.match(stripAnsi(renderChanges([])), /\(no changes\)/);
    });

    test('renders CREATE/UPDATE/DELETE tags with paths', () => {
        const out = stripAnsi(
            renderChanges([
                { path: 'a.txt', type: 'CREATE', content: 'hi' },
                { path: 'b.txt', type: 'UPDATE', content: 'hi' },
                { path: 'c.txt', type: 'DELETE' },
            ])
        );
        assert.match(out, /CREATE\s+a\.txt/);
        assert.match(out, /UPDATE\s+b\.txt/);
        assert.match(out, /DELETE\s+c\.txt/);
        assert.match(out, /\(file removed\)/);
    });

    test('shows package.json key diff when previous JSON provided', () => {
        const before = { name: 'x', version: '1.0.0', dependencies: { foo: '^1.0.0' }, scripts: { test: 'old' } };
        const afterPkg = { name: 'x', version: '1.0.0', dependencies: { foo: '^2.0.0', bar: '^1.0.0' }, scripts: { test: 'new' } };
        const out = stripAnsi(
            renderChanges([{ path: 'package.json', type: 'UPDATE', content: JSON.stringify(afterPkg) }], {
                readDiskJson: () => before,
            })
        );
        assert.match(out, /\+ dependencies\.bar/);
        assert.match(out, /~ dependencies\.foo \^1\.0\.0 → \^2\.0\.0/);
        assert.match(out, /~ scripts\.test/);
    });
});
