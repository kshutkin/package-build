import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { ProjectChanges } from '../src/project-changes.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-changes-test-'));
    await fs.writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'host' }, null, 2)}\n`);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('ProjectChanges', () => {
    test('detects script conflicts regardless of which Tree mutation method was used', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree }) => tree.addScript('lint', 'eslint .'));
        await project.stagePackageOperation('extension-b', ({ tree }) => {
            tree.updateJson('package.json', pkg => {
                pkg.scripts.lint = 'biome check';
                return pkg;
            });
        });

        assert.deepStrictEqual(project.review().conflicts, [
            {
                kind: 'script-value',
                key: 'lint',
                sources: ['extension-a', 'extension-b'],
                message: 'Script "lint" is set to different commands',
            },
        ]);
    });

    test('detects dependency placement and version conflicts through updateJson', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree }) => tree.addDependency('tool', '^1.0.0', 'dependencies'));
        await project.stagePackageOperation('extension-b', ({ tree }) => {
            tree.updateJson('package.json', pkg => {
                pkg.devDependencies = { tool: '^2.0.0' };
                delete pkg.dependencies;
                return pkg;
            });
        });

        assert.strictEqual(project.review().conflicts[0].kind, 'dependency-version');
        assert.deepStrictEqual(project.review().conflicts[0].sources, ['extension-a', 'extension-b']);
    });

    test('project-lock bookkeeping from independent operations does not conflict', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ projectLock }) => {
            projectLock.set('create-pkgbld-extension-a', '1.0.0');
        });
        await project.stagePackageOperation('extension-b', ({ projectLock }) => {
            projectLock.set('create-pkgbld-extension-b', '2.0.0');
        });

        const review = project.review();
        assert.deepStrictEqual(review.conflicts, []);
        const lock = JSON.parse(/** @type {string} */ (review.changes.find(change => change.path === '.pkgbld-lock.json')?.content));
        assert.deepStrictEqual(lock.packages, {
            'create-pkgbld-extension-a': '1.0.0',
            'create-pkgbld-extension-b': '2.0.0',
        });
    });

    test('preserves identical claims without reporting a conflict', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree }) => tree.write('shared.txt', 'same'));
        await project.stagePackageOperation('extension-b', ({ tree }) => tree.write('shared.txt', 'same'));
        assert.deepStrictEqual(project.review().conflicts, []);
    });

    test('reports write-vs-delete conflicts while retaining the sequential final state', async () => {
        await fs.writeFile(path.join(dir, 'shared.txt'), 'original');
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree }) => tree.write('shared.txt', 'replacement'));
        await project.stagePackageOperation('extension-b', ({ tree }) => tree.delete('shared.txt'));

        const review = project.review();
        assert.strictEqual(review.conflicts[0].kind, 'write-vs-delete');
        assert.deepStrictEqual(review.changes, [{ path: 'shared.txt', type: 'DELETE' }]);
    });

    test('rolls back a failed package operation and discards its claims', async () => {
        const project = new ProjectChanges(dir);
        await assert.rejects(
            project.stagePackageOperation('broken-extension', ({ tree, projectLock }) => {
                tree.write('partial.txt', 'partial');
                projectLock.set('create-pkgbld-extension-broken', '1.0.0');
                throw new Error('setup failed');
            }),
            /setup failed/
        );
        assert.deepStrictEqual(project.review(), { changes: [], conflicts: [] });
    });

    test('closes the scoped Tree after its package operation', async () => {
        const project = new ProjectChanges(dir);
        /** @type {import('../src/tree.js').Tree | null} */
        let retained = null;
        await project.stagePackageOperation('extension-a', ({ tree }) => {
            retained = tree;
        });
        assert.throws(() => /** @type {import('../src/tree.js').Tree} */ (retained).write('late.txt', 'late'), /scope is closed/);
    });

    test('closes the project-lock editor after its package operation', async () => {
        const project = new ProjectChanges(dir);
        /** @type {{ set(packageName: string, version: string): void } | null} */
        let retained = null;
        await project.stagePackageOperation('extension-a', ({ projectLock }) => {
            retained = projectLock;
        });
        assert.throws(
            () =>
                /** @type {{ set(packageName: string, version: string): void }} */ (retained).set('create-pkgbld-extension-late', '1.0.0'),
            /scope is closed/
        );
    });

    test('reserves project-lock changes for the dedicated capability', async () => {
        const project = new ProjectChanges(dir);
        await assert.rejects(
            project.stagePackageOperation('extension-a', ({ tree }) => tree.write('.pkgbld-lock.json', '{}\n')),
            /project lock can only be changed through the package-operation lock capability/
        );
        assert.deepStrictEqual(project.review(), { changes: [], conflicts: [] });
    });

    test('retains reported migration conflicts with the staged proposal', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree, reportConflict }) => {
            reportConflict({
                resource: 'script:lint',
                expected: 'old',
                current: 'custom',
                proposed: 'new',
                message: 'Script was customized',
            });
            tree.addScript('lint', 'new');
        });
        const review = project.review();
        assert.equal(review.conflicts[0].kind, 'migration-conflict');
        assert.equal(review.conflicts[0].resource, 'script:lint');
        assert.equal(JSON.parse(review.changes[0].content).scripts.lint, 'new');
    });

    test('can commit project files before the project lock', async () => {
        const project = new ProjectChanges(dir);
        await project.stagePackageOperation('extension-a', ({ tree, projectLock }) => {
            tree.write('updated.txt', 'ready');
            projectLock.set('create-pkgbld-extension-a', '2.0.0');
        });
        await project.commit({ lock: 'exclude' });
        assert.equal(await fs.readFile(path.join(dir, 'updated.txt'), 'utf8'), 'ready');
        await assert.rejects(() => fs.access(path.join(dir, '.pkgbld-lock.json')));

        await project.commit({ lock: 'only' });
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.equal(lock.packages['create-pkgbld-extension-a'], '2.0.0');
    });
});
