import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { openPackageOperations, PackageOperationError } from '../src/package-operations.js';
import { ProjectChanges } from '../src/project-changes.js';
import { LOCK_SCHEMA } from '../src/project-lock.js';

/** @type {string} */
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'package-operations-test-'));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('package operations', () => {
    test('exposes an immutable merged inventory without lifecycle implementation details', async () => {
        const packageName = '@author/pkgbld-plugin-example';
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ dependencies: { [packageName]: '1.2.3' }, peerDependencies: { [packageName]: '^1.0.0' } })
        );
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.2.3' } })
        );

        const packages = await openPackageOperations({
            projectRoot: dir,
            registry: [{ name: 'example', package: `${packageName}/extension`, version: '^1.0.0', description: 'Example', official: true }],
        });

        assert.deepStrictEqual(packages.inventory[0], {
            id: packageName,
            name: 'example',
            description: 'Example',
            tags: [],
            kind: 'plugin',
            state: 'installed-managed',
            error: packages.inventory[0].error,
        });
        assert.strictEqual(Object.isFrozen(packages.inventory), true);
        assert.strictEqual('ext' in packages.inventory[0], false);
        assert.strictEqual('intent' in packages.inventory[0], false);
        assert.strictEqual('lockedVersion' in packages.inventory[0], false);
    });

    test('derives adoption from the managed target and stages its exact installed version', async () => {
        const packageName = 'pkgbld-plugin-example';
        const packageDir = path.join(dir, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.2.3', main: 'index.js' })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', devDependencies: { [packageName]: '^1.0.0' } }));

        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        const operation = await packages.prepare({ package: packageName, target: 'managed' });
        assert.strictEqual(operation.effect, 'adopt');
        assert.deepStrictEqual(operation.questions, []);

        const project = new ProjectChanges(dir);
        await operation.stage(project);
        await project.commit();
        const lock = JSON.parse(await fs.readFile(path.join(dir, '.pkgbld-lock.json'), 'utf8'));
        assert.strictEqual(lock.packages[packageName], '1.2.3');
    });

    test('restores a locked build plugin without acquiring extension code', async () => {
        const packageName = 'pkgbld-plugin-example';
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.2.3' } })
        );

        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        const operation = await packages.prepare({ package: packageName, target: 'managed' });
        assert.strictEqual(operation.effect, 'restore');

        const project = new ProjectChanges(dir);
        await operation.stage(project);
        const packageChange = project.review().changes.find(change => change.path === 'package.json');
        assert.strictEqual(JSON.parse(/** @type {string} */ (packageChange?.content)).devDependencies[packageName], '1.2.3');
    });

    test('prepares extension questions without staging changes, then stages setup and its lock together', async () => {
        const packageName = 'create-pkgbld-extension-example';
        const packageDir = path.join(dir, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.2.3', type: 'module', main: 'index.js' })
        );
        await fs.writeFile(
            path.join(packageDir, 'index.js'),
            `export const manifest = { name: 'example', description: 'Example' };
export const setup = async (tree, options) => tree.write('answer.txt', options.answer);
export const remove = { files: ['answer.txt'] };
export const detect = tree => tree.exists('answer.txt');
export const prompts = () => [{ title: 'Answer', field: 'answer', initialValue: 'default' }];
`
        );
        const registry = [{ name: 'example', package: packageName, version: '^1.0.0', description: 'Example', official: true }];

        const packages = await openPackageOperations({ projectRoot: dir, registry });
        const operation = await packages.prepare({ package: 'example', target: 'managed' });
        assert.strictEqual(operation.effect, 'setup');
        assert.strictEqual(operation.questions[0].field, 'answer');
        await assert.rejects(() => fs.access(path.join(dir, 'answer.txt')));
        await assert.rejects(() => fs.access(path.join(dir, '.pkgbld-lock.json')));

        const project = new ProjectChanges(dir);
        await operation.stage(project, { answer: 'chosen' });
        const changes = project.review().changes;
        assert.strictEqual(changes.find(change => change.path === 'answer.txt')?.content, 'chosen');
        const lock = JSON.parse(/** @type {string} */ (changes.find(change => change.path === '.pkgbld-lock.json')?.content));
        assert.strictEqual(lock.packages[packageName], '1.2.3');
        await assert.rejects(operation.stage(project), /already been staged/);
    });

    test('reports stable errors for unknown and unresolvable package targets', async () => {
        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        await assert.rejects(packages.prepare({ package: 'missing', target: 'managed' }), error => {
            assert.ok(error instanceof PackageOperationError);
            assert.strictEqual(error.code, 'PACKAGE_NOT_FOUND');
            return true;
        });
    });
});
