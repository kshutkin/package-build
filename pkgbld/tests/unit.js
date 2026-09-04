import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { getCliOptions } from '../src/get-cli-options.js';
import { createProvider } from '../src/get-plugins.js';
import { getRollupConfigs } from '../src/get-rollup-configs.js';
import { runPluginBuildEnd } from '../src/load-plugins.js';
import { processPackage } from '../src/process-pkg.js';
import { checkTsConfig } from '../src/process-ts-config.js';

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
