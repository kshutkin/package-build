/// <reference path="./rollup-plugin-preprocess.d.ts" />
import '@niceties/draftlog-appender';
import { dirname, join } from 'node:path';

import { rollup } from 'rollup';

import { green } from '@niceties/ansi';
import { createLogger, LogLevel } from '@niceties/logger';

import { createSubpackages } from './create-subpackages.js';
import { createEjectProvider, ejectConfig } from './eject.js';
import { getCliOptions } from './get-cli-options.js';
import { getJson } from './get-json.js';
import { createProvider } from './get-plugins.js';
import { getRollupConfigs } from './get-rollup-configs.js';
import { formatInput, formatOutput, formatPackageJson, getHelpers, getTimeDiff, searchForWorkspaceRoot, toArray } from './helpers.js';
import { loadPlugins } from './load-plugins.js';
import { mainLoggerText } from './messages.js';
import { processPackage } from './process-pkg.js';
import { checkTsConfig } from './process-ts-config.js';
import { writeJson } from './write-json.js';

/**
 * @typedef {import('rollup').RollupOptions} RollupOptions
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 */

execute();

async function execute() {
    const time = Date.now();
    const mainLogger = createLogger();
    mainLogger.update('preparing..');
    try {
        /** @type {PackageJson} */
        let pkg;
        /** @type {string} */
        let pkgPath;
        [pkgPath, pkg] = /** @type {[string, PackageJson]} */ (await getJson('package.json'));
        /** @type {Set<string>} */
        const loadedPlugins = new Set();
        const plugins = await loadPlugins(pkg, loadedPlugins);
        const [rootPackagePath, rootPkg] = await getJson(join(await searchForWorkspaceRoot(dirname(pkgPath)), 'package.json'));
        if (rootPackagePath !== pkgPath) {
            plugins.push(...(await loadPlugins(rootPkg, loadedPlugins)));
        }
        mainLogger.update('');
        process.stdout.moveCursor?.(0, -1);
        const options = getCliOptions(plugins, pkg);
        process.stdout.moveCursor?.(0, 1);
        mainLogger.update('preparing...');
        const tsConfig = await checkTsConfig(options, mainLogger, plugins);
        const [inputs, inputsExt] = await processPackage(pkg, options, plugins, tsConfig);
        if (options.formatPackageJson) {
            pkg = formatPackageJson(pkg);
        }
        const helpers = getHelpers(/** @type {{ name: string }} */ (pkg).name);
        const preimportMap = preimport();
        const provider = options.eject ? await createEjectProvider(preimportMap) : createProvider(preimportMap);
        const rollupConfigs = await getRollupConfigs(provider, inputs, inputsExt, options, helpers, plugins);

        if (!options.bundle) {
            rollupConfigs.length = 0;
        }

        if (options.eject) {
            await ejectConfig(rollupConfigs, pkgPath, options, inputs, inputsExt, helpers, pkg);
            mainLogger.finish(`ejected config in ${getTimeDiff(time)}`);
            if (options.updatePackageJson) {
                await writeJson(pkgPath, pkg);
            }
        } else {
            const updater = mainLoggerText(options.sourceDir, options.dir, rollupConfigs.length, time);
            mainLogger.start(updater());

            await Promise.all(rollupConfigs.map(config => buildConfig(config, updater)));

            if (options.updatePackageJson) {
                await writeJson(pkgPath, pkg);
            }
            if (options.subpackages) {
                await createSubpackages(inputs, options);
            }

            await Promise.all(
                plugins.filter(plugin => plugin.buildEnd).map(plugin => /** @type {Required<PkgbldPlugin>} */ (plugin).buildEnd())
            );

            mainLogger.finish(updater(true));
        }
    } catch (e) {
        mainLogger.finish(String(e), LogLevel.error);
        process.exit(-1);
    }

    /**
     * @param {RollupOptions} config
     * @param {() => string} updater
     */
    async function buildConfig(config, updater) {
        const bundle = await rollup(config);
        await Promise.all(toArray(config.output).map(config => bundle.write(config)));
        await bundle.close();
        mainLogger(
            `${green('✓')} ${formatInput(/** @type {string | string[]} */ (config.input))} [${formatOutput(config.output, 'format')}]`
        );
        mainLogger.update(updater());
    }
}

function preimport() {
    return process.env.PKGBLD_INTERNAL
        ? new Map([
              ['@rollup-extras/plugin-binify', import('@rollup-extras/plugin-binify')],
              ['@rollup-extras/plugin-clean', import('@rollup-extras/plugin-clean')],
              ['@rollup-extras/plugin-externals', import('@rollup-extras/plugin-externals')],
          ])
        : new Map();
}

process.on('exit', () => {});

/** @typedef {import('./types.js').Json} Json */
/** @typedef {import('./types.js').CliOptions} CliOptions */
/** @typedef {import('./types.js').ParsedOptions} ParsedOptions */
/** @typedef {import('./types.js').PkgbldPluginFactory} PkgbldPluginFactory */
/** @typedef {import('./types.js').Provider} Provider */
/** @typedef {import('./types.js').ProvideFunction} ProvideFunction */
/** @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin */
