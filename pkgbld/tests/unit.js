import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { rollup } from 'rollup';

import { curry } from '../src/builtin-plugins/externals.js';
import { getCliOptions } from '../src/get-cli-options.js';
import { createProvider } from '../src/get-plugins.js';
import { getRollupConfigs } from '../src/get-rollup-configs.js';
import { camelCase } from '../src/helpers.js';
import { runPluginBuildEnd } from '../src/load-plugins.js';
import { isPluginPackageName } from '../src/plugin-name.js';
import { processPackage } from '../src/process-pkg.js';
import { checkTsConfig } from '../src/process-ts-config.js';

const execFile = promisify(childProcess.execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');

describe('plugin discovery', () => {
    test('loads scoped and unscoped plugins once across dependency fields and ignores other names', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkgbld-scoped-plugins-'));
        try {
            await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await fs.copyFile(path.join(packageRoot, 'src/load-plugins.js'), path.join(dir, 'load-plugins.mjs'));
            await fs.copyFile(path.join(packageRoot, 'src/plugin-name.js'), path.join(dir, 'plugin-name.js'));
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
            const { loadPlugins } = await import(pathToFileURL(path.join(dir, 'load-plugins.mjs')).href);
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
            const plugins = await loadPlugins(pkg, loaded);
            assert.deepEqual(plugins.map(plugin => plugin.name).sort(), [...names].sort());
            assert.deepEqual([...loaded].sort(), [...names].sort());
            assert.deepEqual(await loadPlugins(pkg, loaded), []);
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

            const calls = [];
            const plugin = {
                options(_flags, options) {
                    calls.push(['options']);
                    options.tsConfig = true;
                },
                processPackageJson(pkg, inputs) {
                    calls.push(['package', [...inputs]]);
                    pkg.description = 'processed';
                },
                processTsConfig(config) {
                    calls.push(['tsconfig']);
                    config.pluginOption = true;
                },
                async providePlugins(provider) {
                    calls.push(['rollup']);
                    provider.provide(() => ({ name: 'fixture-plugin' }), 500);
                },
                getExtraOutputSettings(format) {
                    calls.push(['output', format]);
                    return { banner: `/* ${format} */` };
                },
                async buildEnd() {
                    calls.push(['buildEnd']);
                },
            };
            const originalArgv = process.argv;
            process.argv = [process.execPath, 'pkgbld', '--formats=es'];
            let config;
            try {
                config = getCliOptions([plugin], {});
            } finally {
                process.argv = originalArgv;
            }
            const logger = () => undefined;
            const tsConfig = await checkTsConfig(config, logger, [plugin]);
            const pkg = {};
            const [inputs, inputsExt] = await processPackage(pkg, config, [plugin]);
            const rollupConfigs = await getRollupConfigs(
                createProvider(),
                inputs,
                inputsExt,
                config,
                { getGlobalName: String, getExternalGlobalName: String },
                [plugin]
            );
            await runPluginBuildEnd([plugin]);

            assert.equal(tsConfig.pluginOption, true);
            assert.equal(pkg.description, 'processed');
            assert.deepEqual(Object.keys(rollupConfigs[0].input), ['index']);
            assert.equal(rollupConfigs[0].output[0].banner, '/* es */');
            assert.ok(rollupConfigs[0].plugins.some(item => item.name === 'fixture-plugin'));
            assert.deepEqual(
                calls.map(call => call[0]),
                ['options', 'tsconfig', 'package', 'rollup', 'output', 'buildEnd']
            );
        });
    });
});

describe('format precedence', () => {
    test('explicit formats override legacy UMD metadata unless --umd is also passed', async () => {
        await withTempDir(async () => {
            await fs.mkdir('src');
            await fs.writeFile('src/index.js', 'export const value = 1;');

            const explicitEs = getOptions('--formats=es');
            const explicitEsPackage = createLegacyUmdPackage();
            await processPackage(explicitEsPackage, explicitEs, []);
            assert.deepEqual(explicitEs.formats, ['es']);
            assert.deepEqual(explicitEs.umdInputs, []);
            assert.equal(explicitEsPackage.umd, './legacy.umd.js');
            assert.equal(explicitEsPackage.unpkg, undefined);

            const explicitUmd = getOptions('--formats=es', '--umd=index');
            const explicitUmdPackage = createLegacyUmdPackage();
            await processPackage(explicitUmdPackage, explicitUmd, []);
            assert.deepEqual(explicitUmd.formats, ['es', 'umd']);
            assert.deepEqual(explicitUmd.umdInputs, ['index']);
            assert.equal(explicitUmdPackage.umd, './dist/index.umd.js');
            assert.equal(explicitUmdPackage.unpkg, './dist/index.umd.js');

            const packageDefaults = getOptions();
            const defaultPackage = createLegacyUmdPackage();
            await processPackage(defaultPackage, packageDefaults, []);
            assert.deepEqual(packageDefaults.formats, ['es', 'cjs', 'umd']);
            assert.deepEqual(packageDefaults.umdInputs, ['index']);
            assert.equal(defaultPackage.umd, './dist/index.umd.js');
            assert.equal(defaultPackage.unpkg, './dist/index.umd.js');
        });
    });
});

function createLegacyUmdPackage() {
    return { name: 'fixture', umd: './legacy.umd.js', scripts: {}, exports: { '.': {} } };
}

function getOptions(...args) {
    const originalArgv = process.argv;
    process.argv = [process.execPath, 'pkgbld', ...args];
    try {
        return getCliOptions([], {});
    } finally {
        process.argv = originalArgv;
    }
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
