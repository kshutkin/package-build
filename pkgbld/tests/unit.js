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
import { processPackage } from '../src/process-pkg.js';
import { checkTsConfig } from '../src/process-ts-config.js';

const execFile = promisify(childProcess.execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');

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
