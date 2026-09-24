import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, describe } from 'node:test';

import { getExtensionCacheSlot } from '../src/extension-cache.js';
import { openPackageOperations, PackageOperationError } from '../src/package-operations.js';
import { ProjectChanges } from '../src/project-changes.js';
import { LOCK_SCHEMA } from '../src/project-lock.js';

/** @type {string} */
let dir;
const originalCacheDir = process.env.CREATE_PKGBLD_CACHE_DIR;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'package-operations-test-'));
    process.env.CREATE_PKGBLD_CACHE_DIR = path.join(dir, 'extension-cache');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    if (originalCacheDir === undefined) delete process.env.CREATE_PKGBLD_CACHE_DIR;
    else process.env.CREATE_PKGBLD_CACHE_DIR = originalCacheDir;
});

describe('package operations', () => {
    test('exposes an immutable merged inventory without lifecycle implementation details', async () => {
        const packageName = '@author/pkgbld-plugin-example';
        const packageDir = path.join(dir, 'node_modules', '@author', 'pkgbld-plugin-example');
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.2.3', main: 'index.js', peerDependencies: { pkgbld: '^1.0.0' } })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
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
            JSON.stringify({ name: packageName, version: '1.2.3', main: 'index.js', peerDependencies: { pkgbld: '^1.0.0' } })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ name: 'host', devDependencies: { [packageName]: '^1.0.0', pkgbld: '^1.0.0' } })
        );

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

    test('excludes a locked third-party plugin whose compatibility cannot be verified', async () => {
        const packageName = 'pkgbld-plugin-example';
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.2.3' } })
        );

        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        assert.deepStrictEqual(packages.inventory, []);
        assert.match(packages.warnings[0], /cannot be verified/);
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

    test('excludes installed legacy plugins and exposes an upgrade warning', async () => {
        const packageName = 'pkgbld-plugin-legacy';
        const packageDir = path.join(dir, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.0.0', main: 'index.js' })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { [packageName]: '1.0.0' } }));

        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        assert.deepEqual(packages.inventory, []);
        assert.match(packages.warnings[0], /does not declare pkgbld in peerDependencies/);
        assert.match(packages.warnings[0], /Upgrade the plugin/);
    });

    test('blocks adoption when the plugin peer range excludes the project host', async () => {
        const packageName = 'pkgbld-plugin-future';
        const packageDir = path.join(dir, 'node_modules', packageName);
        await fs.mkdir(packageDir, { recursive: true });
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify({ name: packageName, version: '1.0.0', main: 'index.js', peerDependencies: { pkgbld: '^2.0.0' } })
        );
        await fs.writeFile(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ devDependencies: { [packageName]: '1.0.0', pkgbld: '^1.0.0' } })
        );

        const packages = await openPackageOperations({ projectRoot: dir, registry: [] });
        await assert.rejects(packages.prepare({ package: packageName, target: 'managed' }), error => {
            assert.ok(error instanceof PackageOperationError);
            assert.equal(error.code, 'PLUGIN_INCOMPATIBLE');
            assert.match(error.message, /requires pkgbld \^2\.0\.0/);
            return true;
        });
    });

    test('excludes a locked official legacy plugin resolved through its extension contract', async () => {
        const packageName = 'pkgbld-plugin-legacy';
        await writeExtensionPackage(path.join(dir, 'node_modules', packageName), packageName, '1.0.0', {
            setup: `{ devDependencies: { '${packageName}': '1.0.0' } }`,
            extensionSubpath: true,
        });
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const registry = [
            { name: 'legacy', package: `${packageName}/extension`, version: '^1.0.0', description: 'Legacy', official: true },
        ];

        const packages = await openPackageOperations({ projectRoot: dir, registry });
        assert.deepEqual(packages.inventory, []);
        assert.match(packages.warnings[0], /does not declare pkgbld in peerDependencies/);
    });

    test('prepares and stages a guarded declarative extension update', async () => {
        const packageName = 'create-pkgbld-extension-example';
        await writeExtensionPackage(path.join(dir, 'node_modules', packageName), packageName, '1.0.0', {
            setup: `{ scripts: { lint: 'tool old' } }`,
        });
        await writeExtensionPackage(
            path.join(getExtensionCacheSlot(packageName, '2.0.0'), 'node_modules', packageName),
            packageName,
            '2.0.0',
            { setup: `{ scripts: { lint: 'tool new' } }` }
        );
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', scripts: { lint: 'tool old' } }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const registry = [{ name: 'example', package: packageName, version: '^2.0.0', description: 'Example', official: true }];

        const packages = await openPackageOperations({ projectRoot: dir, registry, resolveVersion: async () => '2.0.0' });
        const operation = await packages.prepare({ package: 'example', target: 'updated' });
        assert.equal(operation.effect, 'update');
        assert.deepEqual(operation.versionChange, { from: '1.0.0', to: '2.0.0' });
        assert.equal(operation.requiresInstall, false);

        const project = new ProjectChanges(dir);
        await operation.stage(project);
        const review = project.review();
        assert.deepEqual(review.conflicts, []);
        const pkg = JSON.parse(review.changes.find(change => change.path === 'package.json').content);
        const lock = JSON.parse(review.changes.find(change => change.path === '.pkgbld-lock.json').content);
        assert.equal(pkg.scripts.lint, 'tool new');
        assert.equal(lock.packages[packageName], '2.0.0');
    });

    test('records a migration conflict for a customized declarative resource', async () => {
        const packageName = 'create-pkgbld-extension-example';
        await writeExtensionPackage(path.join(dir, 'node_modules', packageName), packageName, '1.0.0', {
            setup: `{ scripts: { lint: 'tool old' } }`,
        });
        await writeExtensionPackage(
            path.join(getExtensionCacheSlot(packageName, '2.0.0'), 'node_modules', packageName),
            packageName,
            '2.0.0',
            { setup: `{ scripts: { lint: 'tool new' } }` }
        );
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', scripts: { lint: 'custom' } }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const registry = [{ name: 'example', package: packageName, version: '^2.0.0', description: 'Example', official: true }];

        const packages = await openPackageOperations({ projectRoot: dir, registry, resolveVersion: async () => '2.0.0' });
        const operation = await packages.prepare({ package: 'example', target: 'updated' });
        const project = new ProjectChanges(dir);
        await operation.stage(project);
        assert.equal(project.review().conflicts[0].kind, 'migration-conflict');
        assert.equal(project.review().conflicts[0].resource, 'script:lint');
    });

    test('updates a plugin dependency exactly and requires installation before lock completion', async () => {
        const packageName = 'pkgbld-plugin-example';
        const oldDir = path.join(dir, 'node_modules', packageName);
        const nextDir = path.join(getExtensionCacheSlot(packageName, '2.0.0'), 'node_modules', packageName);
        await writeExtensionPackage(oldDir, packageName, '1.0.0', {
            setup: `{ devDependencies: { '${packageName}': '^1.0.0' } }`,
            peer: '^1.0.0',
            extensionSubpath: true,
        });
        await writeExtensionPackage(nextDir, packageName, '2.0.0', {
            setup: `{ devDependencies: { '${packageName}': '^2.0.0' } }`,
            peer: '^1.0.0',
            extensionSubpath: true,
        });
        await fs.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ name: 'host', devDependencies: { [packageName]: '1.0.0', pkgbld: '^1.0.0' } })
        );
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '1.0.0' } })
        );
        const registry = [
            { name: 'example', package: `${packageName}/extension`, version: '^2.0.0', description: 'Example', official: true },
        ];

        const packages = await openPackageOperations({ projectRoot: dir, registry, resolveVersion: async () => '2.0.0' });
        const operation = await packages.prepare({ package: 'example', target: 'updated' });
        assert.equal(operation.requiresInstall, true);
        const project = new ProjectChanges(dir);
        await operation.stage(project);
        const pkg = JSON.parse(project.review().changes.find(change => change.path === 'package.json').content);
        assert.equal(pkg.devDependencies[packageName], '2.0.0');
    });

    test('rejects a registry candidate older than the locked version', async () => {
        const packageName = 'create-pkgbld-extension-example';
        await writeExtensionPackage(path.join(dir, 'node_modules', packageName), packageName, '2.0.0', {
            setup: `{ scripts: { lint: 'tool' } }`,
        });
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', scripts: { lint: 'tool' } }));
        await fs.writeFile(
            path.join(dir, '.pkgbld-lock.json'),
            JSON.stringify({ $schema: LOCK_SCHEMA, packages: { [packageName]: '2.0.0' } })
        );
        const registry = [{ name: 'example', package: packageName, version: '^1.0.0', description: 'Example', official: true }];
        const packages = await openPackageOperations({ projectRoot: dir, registry, resolveVersion: async () => '1.5.0' });

        await assert.rejects(packages.prepare({ package: 'example', target: 'updated' }), error => {
            assert.ok(error instanceof PackageOperationError);
            assert.equal(error.code, 'UPDATE_UNAVAILABLE');
            assert.match(error.message, /downgrades are unsupported/);
            return true;
        });
    });
});

async function writeExtensionPackage(packageDir, packageName, version, options) {
    await fs.mkdir(packageDir, { recursive: true });
    const manifest = {
        name: packageName,
        version,
        type: 'module',
        main: 'index.js',
        peerDependencies: options.peer ? { pkgbld: options.peer } : undefined,
        exports: options.extensionSubpath ? { '.': './index.js', './extension': './index.js' } : undefined,
    };
    await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
    await fs.writeFile(
        path.join(packageDir, 'index.js'),
        `export const manifest = { name: 'example', description: 'Example' };\nexport const setup = ${options.setup};\nexport const detect = tree => Boolean(tree.readJson('package.json')?.scripts?.lint);\n`
    );
}
