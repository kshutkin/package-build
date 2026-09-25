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
import { createPackageImportsPlugin } from '../src/builtin-plugins/package-imports.js';
import provideResolve from '../src/builtin-plugins/resolve.js';
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

describe('package import resolution', () => {
    test('externalizes only imports owned by the package being built across symlinks and package boundaries', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.mkdir('workspace/dependency', { recursive: true });
            await fs.mkdir('node_modules');
            await fs.writeFile('package.json', '{}');
            await fs.writeFile('src/index.js', 'export const value = 1;');
            await fs.writeFile('workspace/dependency/package.json', '{"name":"fixture-dependency"}');
            await fs.writeFile('workspace/dependency/index.js', 'export const value = 2;');
            await fs.symlink('index.js', 'src/alias.js');
            await fs.symlink('../workspace/dependency', 'node_modules/fixture-dependency');

            const plugin = createPackageImportsPlugin();
            const own = await plugin.resolveId('#own', path.resolve('src/index.js'));
            assert.deepEqual(own, { id: '#own', external: true });
            assert.deepEqual(await plugin.resolveId('#own', path.resolve('src/alias.js')), own);
            assert.equal(await plugin.resolveId('#dependency', path.resolve('node_modules/fixture-dependency/index.js')), null);
            assert.equal(await plugin.resolveId('fixture-dependency', path.resolve('src/index.js')), null);
        });
    });

    test('passes conditions to nodeResolve only when configured', async () => {
        const calls = [];
        const factories = [];
        const provider = {
            import:
                async () =>
                (...args) => {
                    calls.push(args);
                    return { name: 'resolve-test' };
                },
            provide: factory => factories.push(factory),
        };
        await provideResolve(provider, resolveConfiguration({ argv: [], packageJson: {} }));
        factories.pop()();
        await provideResolve(provider, resolveConfiguration({ argv: ['--conditions=node,development'], packageJson: {} }));
        factories.pop()();
        assert.deepEqual(calls, [[], [{ exportConditions: ['node', 'development'] }]]);
    });

    test('preserves package imports while resolving bundled linked-dependency imports with conditions', async () => {
        await withTempDir(async () => {
            const dependencyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fixture-dependency-'));
            const originalNodeEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                await fs.mkdir('src');
                await fs.mkdir('node_modules');
                await fs.writeFile('package.json', JSON.stringify({ imports: { '#own': './dist/own.mjs' } }));
                await fs.writeFile(
                    'src/index.js',
                    "import { own } from '#own'; import { selected } from 'fixture-dependency'; export { own, selected };"
                );
                await fs.writeFile('src/own.js', 'export const own = true;');
                await fs.writeFile(
                    path.join(dependencyDir, 'package.json'),
                    JSON.stringify({
                        name: 'fixture-dependency',
                        type: 'module',
                        main: './index.js',
                        imports: {
                            '#private': {
                                node: './node.js',
                                production: './production.js',
                                default: './default.js',
                            },
                        },
                    })
                );
                await fs.writeFile(path.join(dependencyDir, 'index.js'), "export { selected } from '#private';");
                for (const condition of ['node', 'production', 'default']) {
                    await fs.writeFile(path.join(dependencyDir, `${condition}.js`), `export const selected = '${condition}';`);
                }
                await fs.symlink(dependencyDir, 'node_modules/fixture-dependency');

                for (const [conditions, includeExternals, expected] of [
                    ['', '--include-externals=fixture-dependency', 'production'],
                    ['--conditions=node', '--include-externals=fixture-dependency', 'node'],
                    ['', '--include-externals=', 'production'],
                ]) {
                    const pkg = { imports: { '#own': './dist/own.mjs' } };
                    const argv = ['--formats=es', includeExternals, ...(conditions ? [conditions] : [])];
                    const configuration = resolveConfiguration({ argv, packageJson: pkg });
                    const packageResult = await processPackage(pkg, configuration, emptyPluginLifecycle);
                    const configs = await getRollupConfigs(
                        createProvider(),
                        packageResult,
                        configuration,
                        { getGlobalName: String, getExternalGlobalName: String },
                        emptyPluginLifecycle
                    );
                    const bundle = await rollup(configs[0]);
                    try {
                        const { output } = await bundle.generate(configs[0].output[0]);
                        const index = output.find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId === path.resolve('src/index.js'));
                        assert.ok(index);
                        assert.match(index.code, /from ['"]#own['"]/);
                        assert.match(index.code, new RegExp(`selected = '${expected}'`));
                        assert.doesNotMatch(index.code, /from ['"]#private['"]/);
                    } finally {
                        await bundle.close();
                    }
                }
            } finally {
                if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
                else process.env.NODE_ENV = originalNodeEnv;
                await fs.rm(dependencyDir, { recursive: true, force: true });
            }
        });
    });

    test('keeps the package-owned import external in an ejected config', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('package.json', JSON.stringify({ name: 'fixture', imports: { '#own': 'node:fs' } }));
            await fs.writeFile('src/index.js', "export { own } from '#own';");
            await fs.symlink(path.join(packageRoot, 'node_modules'), 'node_modules');

            await execFile(
                process.execPath,
                [path.join(packageRoot, 'index.js'), '--eject', '--formats=es', '--conditions=node', '--no-ts-config'],
                {
                    cwd: process.cwd(),
                }
            );
            const { default: configs } = await import(`${pathToFileURL(path.resolve('rollup.config.mjs')).href}?test=${Date.now()}`);
            const bundle = await rollup(configs[0]);
            try {
                const { output } = await bundle.generate(configs[0].output[0]);
                const index = output.find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId === path.resolve('src/index.js'));
                assert.ok(index);
                assert.match(index.code, /from ['"]#own['"]/);
            } finally {
                await bundle.close();
            }
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
    test('discovers exact, conditional, fallback, and wildcard import targets without changing the map', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src/tools', { recursive: true });
            await fs.writeFile('src/index.js', 'export const index = true;');
            await fs.writeFile('src/shared.js', 'export const shared = true;');
            await fs.writeFile('src/node.js', 'export const node = true;');
            await fs.writeFile('src/browser.js', 'export const browser = true;');
            await fs.writeFile('src/tools/one.js', 'export const one = true;');
            await fs.writeFile('src/tools/two.js', 'export const two = true;');
            const imports = {
                '#shared': './dist/shared.mjs',
                '#shared-alias': './dist/shared.mjs',
                '#env': { node: './dist/node.mjs', default: ['./dist/browser.js', null, 'fixture-dependency'] },
                '#tools/*': './dist/tools/*.mjs',
                '#tools-alias/*': './dist/tools/*.mjs',
                '#external': 'fixture-dependency',
                '#blocked': null,
            };
            const pkg = { type: 'module', exports: { '.': {}, './shared': {} }, imports: structuredClone(imports) };
            const configuration = resolveConfiguration({ argv: ['--formats=es'], packageJson: pkg });
            const { entries } = await processPackage(pkg, configuration, emptyPluginLifecycle);

            assert.deepEqual(pkg.imports, imports);
            assert.deepEqual(
                entries.values.filter(entry => entry.origin === 'import').map(entry => [entry.sourcePath, entry.outputPaths]),
                [
                    ['./src/node.js', { es: './dist/node.mjs' }],
                    ['./src/browser.js', { es: './dist/browser.js' }],
                    ['./src/tools/one.js', { es: './dist/tools/one.mjs' }],
                    ['./src/tools/two.js', { es: './dist/tools/two.mjs' }],
                ]
            );
            assert.equal(entries.values.filter(entry => entry.outputPaths.es === './dist/shared.mjs').length, 1);
            assert.equal(entries.require('shared').origin, 'export');
            assert.equal(
                entries.values.filter(entry => entry.origin === 'import').every(entry => Object.isFrozen(entry.outputPaths)),
                true
            );
        });
    });

    test('maps .js targets using the original package type and configured directories', async () => {
        await withTempDir(async () => {
            await fs.mkdir('lib');
            await fs.writeFile('lib/index.ts', 'export const index = true;');
            await fs.writeFile('lib/private.ts', 'export const value = true;');
            const imports = { '#private': './build/private.js', '#types': './build/private.d.ts' };
            const pkg = { imports: structuredClone(imports) };
            const configuration = resolveConfiguration({
                argv: ['--src=lib', '--dest=build', '--formats=cjs', '--no-exports'],
                packageJson: pkg,
            });
            const { entries } = await processPackage(pkg, configuration, emptyPluginLifecycle);
            assert.deepEqual(pkg.imports, imports);
            assert.deepEqual(
                entries.values.filter(entry => entry.origin === 'import').map(entry => entry.outputPaths),
                [{ cjs: './build/private.js' }]
            );
        });
    });

    test('rejects missing, unsafe, excluded, and conflicting import outputs at their manifest paths', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const index = true;');
            await fs.writeFile('src/conflict.js', 'export const conflict = true;');
            await fs.writeFile('src/other.js', 'export const other = true;');
            await fs.writeFile('src/other.conflict.js', 'export const otherConflict = true;');
            const cases = [
                [{ '#missing': './dist/missing.mjs' }, 'SOURCE_NOT_FOUND', 'package.imports["#missing"]'],
                [{ '#outside': './outside/other.mjs' }, 'INVALID_IMPORT_TARGET', 'package.imports["#outside"]'],
                [{ '#traversal': './dist/../other.mjs' }, 'INVALID_IMPORT_TARGET', 'package.imports["#traversal"]'],
                [{ '#query': './dist/other.mjs?query' }, 'INVALID_IMPORT_TARGET', 'package.imports["#query"]'],
                [{ '#url': 'file:///other.mjs' }, 'INVALID_IMPORT_TARGET', 'package.imports["#url"]'],
                [{ '#cjs': './dist/other.cjs' }, 'EXCLUDED_IMPORT_FORMAT', 'package.imports["#cjs"]'],
                [{ '#conflict': './dist/other.conflict.mjs' }, 'OUTPUT_PATH_COLLISION', 'package.imports["#conflict"]'],
                [{ '#missing/*': './dist/absent/*.mjs' }, 'SOURCE_NOT_FOUND', 'package.imports["#missing/*"]'],
                [{ broken: './dist/other.mjs' }, 'INVALID_IMPORT_KEY', 'package.imports["broken"]'],
            ];
            for (const [imports, code, issuePath] of cases) {
                const pkg = { exports: { '.': {}, './conflict': {} }, imports };
                const configuration = resolveConfiguration({ argv: ['--formats=es', '--esm-pattern=other.[name].mjs'], packageJson: pkg });
                await assert.rejects(
                    () => processPackage(pkg, configuration, emptyPluginLifecycle),
                    error =>
                        error instanceof BuildEntryError &&
                        error.issues.some(
                            issue =>
                                issue.code === code &&
                                issue.path === issuePath &&
                                (code !== 'OUTPUT_PATH_COLLISION' || issue.message.includes('package.exports["./conflict"]'))
                        )
                );
            }
            const malformed = { imports: [] };
            const configuration = resolveConfiguration({ argv: [], packageJson: malformed });
            await assert.rejects(
                () => processPackage(malformed, configuration, emptyPluginLifecycle),
                error => error instanceof BuildEntryError && error.issues.some(issue => issue.code === 'INVALID_IMPORT_MAP')
            );
        });
    });

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
    test('resolves package imports and additional conditions in authority order', () => {
        const packageJson = { imports: { '#helper': './dist/helper.mjs' } };
        const defaults = resolveConfiguration({ argv: [], packageJson: {} });
        assert.deepEqual(defaults.resolution, { imports: false, conditions: [] });

        const packageConfiguration = resolveConfiguration({ argv: [], packageJson });
        assert.deepEqual(packageConfiguration.resolution, { imports: true, conditions: [] });
        assert.equal(resolveConfiguration({ argv: ['--imports'], packageJson: {} }).resolution.imports, true);

        const cliConfiguration = resolveConfiguration({
            argv: ['--no-imports', '--conditions=node,development,node'],
            packageJson,
        });
        assert.deepEqual(cliConfiguration.resolution, { imports: false, conditions: ['node', 'development'] });

        let sourcesSeen = false;
        const pluginConfiguration = resolveConfiguration({
            argv: ['--no-imports', '--conditions=node'],
            packageJson,
            plugins: [
                {
                    configure({ draft, sources }) {
                        assert.deepEqual(sources.defaults.resolution, { imports: false, conditions: [] });
                        assert.deepEqual(sources.package.imports, packageJson.imports);
                        assert.equal(sources.cli.provided.imports, true);
                        assert.equal(sources.cli.provided.conditions, true);
                        assert.deepEqual(sources.cli.values.conditions, ['node']);
                        sourcesSeen = true;
                        draft.resolution.imports = true;
                        draft.resolution.conditions = ['browser'];
                    },
                },
            ],
        });
        assert.equal(sourcesSeen, true);
        assert.deepEqual(pluginConfiguration.resolution, { imports: true, conditions: ['browser'] });
        assert.equal(Object.isFrozen(pluginConfiguration.resolution), true);
        assert.equal(Object.isFrozen(pluginConfiguration.resolution.conditions), true);
        assert.throws(() => pluginConfiguration.resolution.conditions.push('node'), TypeError);
    });

    test('rejects invalid resolver settings', () => {
        assert.throws(
            () => resolveConfiguration({ argv: ['--conditions=node,,development'], packageJson: {} }),
            error =>
                error instanceof BuildConfigurationError &&
                error.issues.some(issue => issue.path === 'resolution.conditions' && issue.code === 'INVALID_LIST_VALUE')
        );
        assert.throws(
            () =>
                resolveConfiguration({
                    argv: [],
                    packageJson: {},
                    plugins: [{ configure: ({ draft }) => (draft.resolution.imports = /** @type {any} */ ('yes')) }],
                }),
            error =>
                error instanceof BuildConfigurationError &&
                error.issues.some(issue => issue.path === 'resolution.imports' && issue.code === 'INVALID_CONFIGURATION_SHAPE')
        );
    });

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
