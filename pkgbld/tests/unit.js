import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { rollup } from 'rollup';

import { BuildConfigurationError, resolveBuildConfiguration } from '../src/build-configuration.js';
import { BuildEntryError } from '../src/build-entries.js';
import { createBuildPluginLifecycle } from '../src/build-plugin-lifecycle.js';
import { curry } from '../src/builtin-plugins/externals.js';
import { createProvider } from '../src/get-plugins.js';
import { getRollupConfigs } from '../src/get-rollup-configs.js';
import { camelCase } from '../src/helpers.js';
import { loadPlugins } from '../src/load-plugins.js';
import { isPluginPackageName } from '../src/plugin-name.js';
import { processPackage } from '../src/process-pkg.js';
import { checkTsConfig } from '../src/process-ts-config.js';

const execFile = promisify(childProcess.execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const emptyPluginLifecycle = createBuildPluginLifecycle([]);

test('public declaration dependencies are published', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.dependencies['type-fest'], 'catalog:');
});

describe('plugin discovery', () => {
    test('loads scoped and unscoped plugins once across dependency fields and ignores other names', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkgbld-scoped-plugins-'));
        try {
            const packageJsonPath = path.join(dir, 'package.json');
            await fs.writeFile(packageJsonPath, JSON.stringify({ type: 'module' }));
            const names = ['pkgbld-plugin-demo', '@author/pkgbld-plugin-demo', '@other/pkgbld-plugin-demo'];
            for (const name of names) {
                const moduleDir = path.join(dir, 'node_modules', name);
                await fs.mkdir(moduleDir, { recursive: true });
                await fs.writeFile(
                    path.join(moduleDir, 'package.json'),
                    JSON.stringify({
                        name,
                        type: 'module',
                        exports: './index.js',
                    })
                );
                await fs.writeFile(
                    path.join(moduleDir, 'index.js'),
                    `export function create() { return { name: ${JSON.stringify(name)} }; }`
                );
            }
            const loaded = new Set();
            const pkg = {
                dependencies: { 'pkgbld-plugin-demo': '*', '@author/pkgbld-plugin-demo': '*' },
                devDependencies: {
                    '@author/pkgbld-plugin-demo': '*',
                    '@author/create-pkgbld-extension-demo': '*',
                    '@pkgbld-plugin-author/unrelated': '*',
                    '@author/other-pkgbld-plugin-demo': '*',
                    '@author/pkgbld-plugin': '*',
                    'other-pkgbld-plugin-demo': '*',
                },
                peerDependencies: { '@other/pkgbld-plugin-demo': '*' },
            };
            const plugins = await loadPlugins(pkg, loaded, packageJsonPath);
            assert.deepEqual(plugins.map(plugin => plugin.name).sort(), [...names].sort());
            assert.deepEqual([...loaded].sort(), [...names].sort());
            assert.deepEqual(await loadPlugins(pkg, loaded, packageJsonPath), []);

            await assert.rejects(
                () => loadPlugins({ devDependencies: { 'pkgbld-plugin-missing': '*' } }, new Set(), packageJsonPath),
                /Failed to load Build plugin "pkgbld-plugin-missing"/
            );
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    test('uses the scoped and unscoped package-name contract', () => {
        assert.equal(isPluginPackageName('pkgbld-plugin-demo'), true);
        assert.equal(isPluginPackageName('@author/pkgbld-plugin-demo'), true);
        assert.equal(isPluginPackageName('@author/create-pkgbld-extension-demo'), false);
        assert.equal(isPluginPackageName('@author/other-pkgbld-plugin-demo'), false);
    });
});

describe('local utilities', () => {
    test('converts package and JavaScript names to camel case', () => {
        assert.equal(camelCase('@scope/package-name'), 'scopePackageName');
        assert.equal(camelCase('XMLHttpRequest'), 'xmlHttpRequest');
        assert.equal(camelCase('alreadyCamelCase'), 'alreadyCamelCase');
        assert.equal(camelCase('déjà vu'), 'dejaVu');
    });

    test('curries arguments over multiple calls', () => {
        const join = curry((first, second, third) => `${first}:${second}:${third}`);
        assert.equal(join('one')('two', 'three'), 'one:two:three');
    });

    test('embeds local utilities into an executable multi-input UMD config', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('package.json', JSON.stringify({ name: '@scope/package-name', exports: { '.': {}, './second': {} } }));
            await fs.writeFile('src/index.js', 'export const index = true;');
            await fs.writeFile('src/second.js', 'export const second = true;');
            await fs.symlink(path.join(packageRoot, 'node_modules'), 'node_modules');

            await execFile(
                process.execPath,
                [path.join(packageRoot, 'index.js'), '--eject', '--formats=umd', '--umd=index,second', '--no-ts-config'],
                { cwd: process.cwd() }
            );

            const generatedConfig = await fs.readFile('rollup.config.mjs', 'utf8');
            assert.doesNotMatch(generatedConfig, /lodash/);
            assert.match(generatedConfig, /function camelCase/);
            assert.match(generatedConfig, /function curry/);

            const { default: configs } = await import(`${pathToFileURL(path.resolve('rollup.config.mjs')).href}?test=${Date.now()}`);
            for (const config of configs) {
                const bundle = await rollup(config);
                for (const output of Array.isArray(config.output) ? config.output : [config.output]) {
                    await bundle.write(output);
                }
                await bundle.close();
            }

            await Promise.all([fs.access('dist/index.umd.js'), fs.access('dist/second.umd.js')]);
        });
    });
});

describe('plugin lifecycle', () => {
    test('applies package, tsconfig, Rollup, and output hooks', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');
            await fs.writeFile('src/worker.js', 'export const worker = 1;');

            const calls = [];
            const plugin = {
                configure({ draft }) {
                    calls.push(['configure']);
                    draft.typescript.updateConfig = true;
                },
                contributeEntries({ entries }) {
                    calls.push(['entries']);
                    entries.add({ name: 'worker' });
                },
                processPackageJson({ packageJson, entries }) {
                    calls.push(['package', entries.values.map(entry => entry.sourcePath)]);
                    packageJson.description = 'processed';
                },
                processTsConfig({ config }) {
                    calls.push(['tsconfig']);
                    config.pluginOption = true;
                },
                async providePlugins({ provider }) {
                    calls.push(['rollup']);
                    provider.provide(() => ({ name: 'fixture-plugin' }), 500);
                },
                getExtraOutputSettings({ format }) {
                    calls.push(['output', format]);
                    return { banner: `/* ${format} */` };
                },
                async buildEnd() {
                    calls.push(['buildEnd']);
                },
            };
            const secondPlugin = {
                configure() {
                    calls.push(['configure-2']);
                },
                contributeEntries() {
                    calls.push(['entries-2']);
                },
                processPackageJson() {
                    calls.push(['package-2']);
                },
                processTsConfig() {
                    calls.push(['tsconfig-2']);
                },
                async providePlugins({ provider }) {
                    calls.push(['rollup-2']);
                    provider.provide(() => ({ name: 'fixture-plugin-2' }), 501);
                },
                getExtraOutputSettings({ format }) {
                    calls.push(['output-2', format]);
                    return { banner: `/* ${format} second */` };
                },
                async buildEnd() {
                    calls.push(['buildEnd-2']);
                },
            };
            const pluginLifecycle = createBuildPluginLifecycle([plugin, secondPlugin]);
            const configuration = resolveBuildConfiguration({ argv: ['--formats=es'], packageJson: {}, pluginLifecycle });
            const logger = () => undefined;
            const tsConfig = await checkTsConfig(configuration, logger, pluginLifecycle);
            const pkg = {};
            const packageResult = await processPackage(pkg, configuration, pluginLifecycle);
            const rollupConfigs = await getRollupConfigs(
                createProvider(),
                packageResult,
                configuration,
                { getGlobalName: String, getExternalGlobalName: String },
                pluginLifecycle
            );
            await pluginLifecycle.buildEnd(configuration);

            assert.equal(tsConfig.pluginOption, true);
            assert.equal(pkg.description, 'processed');
            assert.deepEqual(Object.keys(rollupConfigs[0].input), ['index', 'worker']);
            assert.equal(rollupConfigs[0].output[0].banner, '/* es second */');
            assert.ok(rollupConfigs[0].plugins.some(item => item.name === 'fixture-plugin'));
            assert.ok(rollupConfigs[0].plugins.some(item => item.name === 'fixture-plugin-2'));
            assert.deepEqual(
                calls
                    .slice(0, 2)
                    .map(call => call[0])
                    .sort(),
                ['configure', 'configure-2']
            );
            assert.deepEqual(
                calls
                    .slice(2, 4)
                    .map(call => call[0])
                    .sort(),
                ['tsconfig', 'tsconfig-2']
            );
            assert.deepEqual(
                calls
                    .slice(4, 6)
                    .map(call => call[0])
                    .sort(),
                ['entries', 'entries-2']
            );
            assert.deepEqual(
                calls
                    .slice(6, 8)
                    .map(call => call[0])
                    .sort(),
                ['package', 'package-2']
            );
            assert.deepEqual(
                calls
                    .slice(8, 10)
                    .map(call => call[0])
                    .sort(),
                ['rollup', 'rollup-2']
            );
            assert.deepEqual(
                calls
                    .slice(10, 12)
                    .map(call => call[0])
                    .sort(),
                ['output', 'output-2']
            );
            assert.deepEqual(
                calls
                    .slice(12, 14)
                    .map(call => call[0])
                    .sort(),
                ['buildEnd', 'buildEnd-2']
            );
        });
    });

    test('shares build-scoped state without serializing asynchronous hooks', async () => {
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });
        let entered = 0;
        let sharedSize = 0;
        const plugins = ['first', 'second'].map(name => ({
            async providePlugins({ shared }) {
                entered += 1;
                shared.set(name, true);
                await gate;
            },
            async buildEnd({ shared }) {
                sharedSize = shared.size;
            },
        }));
        const pluginLifecycle = createBuildPluginLifecycle(plugins);
        const configuration = resolveBuildConfiguration({ argv: [], packageJson: {}, pluginLifecycle });
        const inProgress = pluginLifecycle.provideRollupPlugins(createProvider()[0], configuration, {
            entries: { values: [], require: () => assert.fail('no entries expected') },
            executableOutputs: [],
        });

        assert.equal(entered, 2);
        release();
        await inProgress;
        await pluginLifecycle.buildEnd(configuration);
        assert.equal(sharedSize, 2);
    });
});

describe('format precedence', () => {
    test('explicit formats override legacy UMD metadata unless --umd is also passed', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');
            await fs.writeFile('src/core.js', 'export const core = 1;');

            const explicitEsPackage = createLegacyUmdPackage();
            const explicitEs = resolveConfiguration({ argv: ['--formats=es'], packageJson: explicitEsPackage });
            await processPackage(explicitEsPackage, explicitEs, emptyPluginLifecycle);
            assert.deepEqual(explicitEs.outputs.formats, ['es']);
            assert.deepEqual(explicitEs.outputs.umdEntries, []);
            assert.equal(explicitEsPackage.umd, './legacy.umd.js');
            assert.equal(explicitEsPackage.unpkg, undefined);

            const explicitUmdPackage = createLegacyUmdPackage();
            const explicitUmd = resolveConfiguration({
                argv: ['--formats=es', '--umd=index'],
                packageJson: explicitUmdPackage,
            });
            await processPackage(explicitUmdPackage, explicitUmd, emptyPluginLifecycle);
            assert.deepEqual(explicitUmd.outputs.formats, ['es', 'umd']);
            assert.deepEqual(explicitUmd.outputs.umdEntries, ['index']);
            assert.equal(explicitUmdPackage.umd, './dist/index.umd.js');
            assert.equal(explicitUmdPackage.unpkg, './dist/index.umd.js');

            const explicitCoreUmdPackage = createLegacyUmdPackage();
            const explicitCoreUmd = resolveConfiguration({ argv: ['--umd=core'], packageJson: explicitCoreUmdPackage });
            await processPackage(explicitCoreUmdPackage, explicitCoreUmd, emptyPluginLifecycle);
            assert.deepEqual(explicitCoreUmd.outputs.formats, ['es', 'cjs', 'umd']);
            assert.deepEqual(explicitCoreUmd.outputs.umdEntries, ['core']);
            assert.equal(explicitCoreUmdPackage.umd, './legacy.umd.js');
            assert.equal(explicitCoreUmdPackage.unpkg, undefined);

            const disabledUmdPackage = createLegacyUmdPackage();
            const disabledUmd = resolveConfiguration({ argv: ['--umd='], packageJson: disabledUmdPackage });
            await processPackage(disabledUmdPackage, disabledUmd, emptyPluginLifecycle);
            assert.deepEqual(disabledUmd.outputs.formats, ['es', 'cjs']);
            assert.deepEqual(disabledUmd.outputs.umdEntries, []);
            assert.equal(disabledUmdPackage.umd, './legacy.umd.js');
            assert.equal(disabledUmdPackage.unpkg, undefined);

            const defaultPackage = createLegacyUmdPackage();
            const packageDefaults = resolveConfiguration({ argv: [], packageJson: defaultPackage });
            await processPackage(defaultPackage, packageDefaults, emptyPluginLifecycle);
            assert.deepEqual(packageDefaults.outputs.formats, ['es', 'cjs', 'umd']);
            assert.deepEqual(packageDefaults.outputs.umdEntries, ['index']);
            assert.equal(defaultPackage.umd, './dist/index.umd.js');
            assert.equal(defaultPackage.unpkg, './dist/index.umd.js');

            const freshDefaults = resolveConfiguration({ argv: [], packageJson: {} });
            assert.deepEqual(freshDefaults.outputs.formats, ['es', 'cjs']);
            assert.deepEqual(freshDefaults.outputs.umdEntries, []);
        });
    });

    test('plugin format changes override package format inference', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');
            await fs.writeFile('src/core.js', 'export const core = 1;');

            const plugin = {
                configure({ draft }) {
                    draft.outputs.formats = ['es'];
                    draft.outputs.umdEntries = [];
                },
            };
            const pkg = createLegacyUmdPackage();
            const configuration = resolveConfiguration({ argv: [], packageJson: pkg, plugins: [plugin] });
            await processPackage(pkg, configuration, emptyPluginLifecycle);

            assert.deepEqual(configuration.outputs.formats, ['es']);
            assert.deepEqual(configuration.outputs.umdEntries, []);
            assert.equal(pkg.main, './dist/index.mjs');
            assert.equal(pkg.module, undefined);
            assert.equal(pkg.unpkg, undefined);
            assert.equal(pkg.exports['.'].require, undefined);
            assert.equal(pkg.exports['.'].default, './dist/index.mjs');
        });
    });
});

describe('build entries', () => {
    test('rejects duplicate Build plugin contributions', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');

            const pkg = { name: 'fixture' };
            const configuration = resolveConfiguration({ argv: [], packageJson: pkg });
            const pluginLifecycle = createBuildPluginLifecycle([
                {
                    contributeEntries({ entries }) {
                        entries.add({ name: 'index' });
                    },
                },
            ]);

            await assert.rejects(
                () => processPackage(pkg, configuration, pluginLifecycle),
                error =>
                    error instanceof BuildEntryError &&
                    error.issues.some(
                        issue => issue.code === 'DUPLICATE_BUILD_ENTRY' && issue.path === 'plugins.entries[0]' && issue.name === 'index'
                    )
            );
        });
    });

    test('rejects configured selections that were not discovered', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');

            const pkg = { name: 'fixture' };
            const configuration = resolveConfiguration({ argv: ['--formats=umd', '--umd=core'], packageJson: pkg });

            await assert.rejects(
                () => processPackage(pkg, configuration, emptyPluginLifecycle),
                error =>
                    error instanceof BuildEntryError &&
                    error.issues.some(
                        issue =>
                            issue.code === 'SELECTED_BUILD_ENTRY_NOT_FOUND' &&
                            issue.path === 'outputs.umdEntries[0]' &&
                            issue.name === 'core'
                    )
            );
        });
    });
});

describe('build configuration resolution', () => {
    test('resolves package metadata, explicit CLI options, and Build plugins in authority order', () => {
        const packageJson = createLegacyUmdPackage();

        const packageConfiguration = resolveConfiguration({ argv: [], packageJson });
        assert.deepEqual(packageConfiguration.outputs.formats, ['es', 'cjs', 'umd']);
        assert.deepEqual(packageConfiguration.outputs.umdEntries, ['index']);

        const cliConfiguration = resolveConfiguration({ argv: ['--formats=es'], packageJson });
        assert.deepEqual(cliConfiguration.outputs.formats, ['es']);
        assert.deepEqual(cliConfiguration.outputs.umdEntries, []);

        let sharedValue;
        const pluginLifecycle = createBuildPluginLifecycle([
            {
                configure({ draft, sources, shared }) {
                    assert.equal(sources.package.umd, './legacy.umd.js');
                    assert.equal(sources.cli.provided.formats, true);
                    assert.deepEqual(sources.cli.values.formats, ['es']);
                    shared.set('configured', true);
                    draft.outputs.formats = ['cjs'];
                    draft.outputs.umdEntries = [];
                },
                processTsConfig({ shared }) {
                    sharedValue = shared.get('configured');
                },
            },
        ]);
        const pluginConfiguration = resolveBuildConfiguration({
            argv: ['--formats=es'],
            packageJson,
            pluginLifecycle,
        });
        assert.deepEqual(pluginConfiguration.outputs.formats, ['cjs']);
        pluginLifecycle.processTsConfig({}, pluginConfiguration);
        assert.equal(sharedValue, true);
    });

    test('normalizes, validates, and deeply freezes the final Build configuration', () => {
        const configuration = resolveConfiguration({
            argv: [],
            packageJson: { name: 'fixture' },
            plugins: [
                {
                    configure({ draft }) {
                        draft.outputs.formats = ['es', 'es'];
                        draft.outputs.umdEntries = ['index', 'index'];
                    },
                },
            ],
        });

        assert.deepEqual(configuration.outputs.formats, ['es', 'umd']);
        assert.deepEqual(configuration.outputs.umdEntries, ['index']);
        assert.equal(Object.isFrozen(configuration), true);
        assert.equal(Object.isFrozen(configuration.outputs), true);
        assert.equal(Object.isFrozen(configuration.outputs.formats), true);
        assert.throws(() => configuration.outputs.formats.push('cjs'), TypeError);

        assert.throws(
            () =>
                resolveConfiguration({
                    argv: [],
                    packageJson: {},
                    plugins: [{ configure: ({ draft }) => draft.outputs.formats.push('invalid') }],
                }),
            error => error instanceof BuildConfigurationError && error.issues.some(issue => issue.code === 'UNSUPPORTED_FORMAT')
        );
        assert.throws(
            () =>
                resolveConfiguration({
                    argv: [],
                    packageJson: {},
                    plugins: [
                        {
                            configure({ draft }) {
                                /** @type {any} */ (draft).unknown = true;
                            },
                        },
                    ],
                }),
            error => error instanceof BuildConfigurationError && error.issues.some(issue => issue.code === 'UNKNOWN_CONFIGURATION_KEY')
        );
        assert.throws(
            () =>
                resolveConfiguration({
                    argv: [],
                    packageJson: {},
                    plugins: [
                        {
                            configure({ draft }) {
                                /** @type {any} */ (draft).outputs = null;
                            },
                        },
                    ],
                }),
            error => error instanceof BuildConfigurationError && error.issues.some(issue => issue.code === 'INVALID_CONFIGURATION_SHAPE')
        );
    });
});

describe('bin inference', () => {
    test('preserves nested entry paths from package.json bin', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src/folder', { recursive: true });
            await fs.writeFile('src/index.js', 'export const value = 1;');
            await fs.writeFile('src/folder/cli.js', 'console.log("cli");');

            for (const bin of ['./dist/folder/cli.cjs', { fixture: './dist/folder/cli.cjs' }]) {
                const pkg = {
                    bin,
                    exports: { '.': {}, './folder/cli': {} },
                };
                const configuration = resolveConfiguration({ argv: ['--formats=cjs'], packageJson: pkg });
                const packageResult = await processPackage(pkg, configuration, emptyPluginLifecycle);

                assert.deepEqual(packageResult.executableOutputs, ['./dist/folder/cli.cjs']);
                assert.deepEqual(
                    packageResult.entries.values.map(entry => ({
                        name: entry.name,
                        sourcePath: entry.sourcePath,
                        extension: entry.extension,
                        cjs: entry.outputPaths.cjs,
                    })),
                    [
                        { name: 'index', sourcePath: './src/index.js', extension: 'js', cjs: './dist/index.cjs' },
                        {
                            name: 'folder/cli',
                            sourcePath: './src/folder/cli.js',
                            extension: 'js',
                            cjs: './dist/folder/cli.cjs',
                        },
                    ]
                );
            }
        });
    });
});

function createLegacyUmdPackage() {
    return { name: 'fixture', umd: './legacy.umd.js', scripts: {}, exports: { '.': {}, './core': {} } };
}

function resolveConfiguration({ argv, packageJson, plugins = [] }) {
    return resolveBuildConfiguration({
        argv,
        packageJson,
        pluginLifecycle: createBuildPluginLifecycle(plugins),
    });
}

/**
 * @param {() => Promise<void>} callback
 */
async function withTempDir(callback) {
    const originalCwd = process.cwd();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkgbld-test-'));
    process.chdir(tempDir);
    try {
        await callback();
    } finally {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

describe('JSON indentation', () => {
    for (const indent of ['  ', '    ', '\t']) {
        test(`writeJson preserves ${JSON.stringify(indent)} indentation`, async () => {
            const { writeJson } = await import('../src/write-json.js');
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkgbld-json-'));
            try {
                const file = path.join(dir, 'package.json');
                await fs.writeFile(file, `${JSON.stringify({ name: 'old' }, null, indent)}\n`);
                const data = { name: 'new', nested: { value: true } };
                await writeJson(file, data);
                assert.equal(await fs.readFile(file, 'utf8'), `${JSON.stringify(data, null, indent)}\n`);
            } finally {
                await fs.rm(dir, { recursive: true, force: true });
            }
        });
    }
    test('formatter defaults to two spaces without detectable indentation', async () => {
        const { toFormattedJson } = await import('../src/options/index.js');
        for (const current of [undefined, null, '', '{}', '{"name":"old"}']) {
            assert.equal(toFormattedJson({ name: 'new' }, current), '{\n  "name": "new"\n}\n');
        }
    });
});
