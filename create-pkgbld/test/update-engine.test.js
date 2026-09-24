import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { Tree } from '../src/tree.js';
import { runExtensionUpdate } from '../src/update-engine.js';

let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-engine-test-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('guarded extension updates', () => {
    test('applies clean declarative transitions and preserves unchanged custom resources', async () => {
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({
                devDependencies: { tool: '^1.0.0' },
                scripts: { lint: 'tool old', custom: 'user command' },
            })
        );
        const tree = new Tree(dir);
        const conflicts = [];
        await runExtensionUpdate({
            previous: {
                manifest: { name: 'fixture', description: '' },
                setup: { devDependencies: { tool: '^1.0.0' }, scripts: { lint: 'tool old', custom: 'default command' } },
            },
            target: {
                manifest: { name: 'fixture', description: '' },
                setup: { devDependencies: { tool: '^2.0.0' }, scripts: { lint: 'tool new', custom: 'default command' } },
            },
            tree,
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            reportConflict: conflict => conflicts.push(conflict),
        });

        const pkg = tree.readJson('package.json');
        assert.equal(pkg.devDependencies.tool, '^2.0.0');
        assert.equal(pkg.scripts.lint, 'tool new');
        assert.equal(pkg.scripts.custom, 'user command');
        assert.deepEqual(conflicts, []);
    });

    test('reports modified resources and stages the proposed value', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { lint: 'user command' } }));
        const tree = new Tree(dir);
        const conflicts = [];
        await runExtensionUpdate({
            previous: { manifest: { name: 'fixture', description: '' }, setup: { scripts: { lint: 'tool old' } } },
            target: { manifest: { name: 'fixture', description: '' }, setup: { scripts: { lint: 'tool new' } } },
            tree,
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            reportConflict: conflict => conflicts.push(conflict),
        });

        assert.equal(tree.readJson('package.json').scripts.lint, 'tool new');
        assert.equal(conflicts.length, 1);
        assert.equal(conflicts[0].resource, 'script:lint');
        assert.equal(conflicts[0].expected, 'tool old');
        assert.equal(conflicts[0].current, 'user command');
        assert.equal(conflicts[0].proposed, 'tool new');
    });

    test('lets an explicit target hook combine declarative and semantic migration', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { lint: 'tool old' } }));
        await fs.writeFile(path.join(dir, 'fixture.json'), JSON.stringify({ user: true, old: true }));
        const tree = new Tree(dir);
        const previous = {
            manifest: { name: 'fixture', description: '' },
            setup: { scripts: { lint: 'tool old' }, files: { 'fixture.json': 'inline:{"old":true}\n' } },
        };
        const target = {
            manifest: { name: 'fixture', description: '' },
            setup: { scripts: { lint: 'tool new' }, files: { 'fixture.json': 'inline:{"new":true}\n' } },
            async update(updateTree, context) {
                context.reconcileDeclarative({ exclude: ['file:fixture.json'] });
                updateTree.updateJson('fixture.json', value => ({ ...value, old: undefined, next: true }));
            },
        };
        await runExtensionUpdate({
            previous,
            target,
            tree,
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            reportConflict: () => assert.fail('unexpected conflict'),
        });

        assert.equal(tree.readJson('package.json').scripts.lint, 'tool new');
        assert.deepEqual(tree.readJson('fixture.json'), { user: true, next: true });
    });
});
