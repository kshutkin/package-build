/// <reference path="./rollup-plugin-preprocess.d.ts" />
import '@niceties/draftlog-appender';
import { dirname, join } from 'node:path';

import { rollup } from 'rollup';

import { green } from '@niceties/ansi';
import { createLogger, LogLevel } from '@niceties/logger';

import { resolveBuildConfiguration } from './build-configuration.js';
import { createBuildPluginLifecycle } from './build-plugin-lifecycle.js';
import { createEjectProvider, ejectConfig } from './eject.js';
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
        const plugins = await loadPlugins(pkg, loadedPlugins, pkgPath);
        const [rootPackagePath, rootPkg] = await getJson(join(await searchForWorkspaceRoot(dirname(pkgPath)), 'package.json'));
        if (rootPackagePath !== pkgPath) {
            plugins.push(...(await loadPlugins(rootPkg, loadedPlugins, rootPackagePath)));
        }
        const pluginLifecycle = createBuildPluginLifecycle(plugins);
        mainLogger.update('');
        process.stdout.moveCursor?.(0, -1);
        const configuration = resolveBuildConfiguration({ packageJson: pkg, pluginLifecycle });
        process.stdout.moveCursor?.(0, 1);
        mainLogger.update('preparing...');
        await checkTsConfig(configuration, mainLogger, pluginLifecycle);
        const packageResult = await processPackage(pkg, configuration, pluginLifecycle);
        if (configuration.packageJson.format) {
            pkg = formatPackageJson(pkg);
        }
        const helpers = getHelpers(/** @type {{ name: string }} */ (pkg).name);
        const provider = configuration.execution.eject ? await createEjectProvider() : createProvider();
        const rollupConfigs = await getRollupConfigs(provider, packageResult, configuration, helpers, pluginLifecycle);

        if (!configuration.execution.bundle) {
            rollupConfigs.length = 0;
        }

        if (configuration.execution.eject) {
            await ejectConfig(rollupConfigs, pkgPath, configuration, packageResult, helpers, pkg);
            mainLogger.finish(`ejected config in ${getTimeDiff(time)}`);
            if (configuration.packageJson.update) {
                await writeJson(pkgPath, pkg);
            }
        } else {
            const updater = mainLoggerText(configuration.paths.sourceDir, configuration.paths.outputDir, rollupConfigs.length, time);
            mainLogger.start(updater());

            await Promise.all(rollupConfigs.map(config => buildConfig(config, updater)));

            if (configuration.packageJson.update) {
                await writeJson(pkgPath, pkg);
            }
            await pluginLifecycle.buildEnd(configuration);

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
            `${green('✓')} ${formatInput(
                /** @type {string | string[]} */ (
                    typeof config.input === 'object' && !Array.isArray(config.input) ? Object.values(config.input) : config.input
                )
            )} [${formatOutput(config.output, 'format')}]`
        );
        mainLogger.update(updater());
    }
}

/** @typedef {import('./types.js').Json} Json */
/** @typedef {import('./types.js').BuildConfiguration} BuildConfiguration */
/** @typedef {import('./types.js').BuildFormat} BuildFormat */
/** @typedef {import('./types.js').BuildConfigurationDraft} BuildConfigurationDraft */
/** @typedef {import('./types.js').BuildConfigurationSources} BuildConfigurationSources */
/** @typedef {import('./types.js').BuildEntry} BuildEntry */
/** @typedef {import('./types.js').BuildEntries} BuildEntries */
/** @typedef {import('./types.js').BuildEntryContribution} BuildEntryContribution */
/** @typedef {import('./types.js').BuildEntryContributions} BuildEntryContributions */
/** @typedef {import('./types.js').BuildEntryIssue} BuildEntryIssue */
/** @typedef {import('./types.js').ParsedOptions} ParsedOptions */
/** @typedef {import('./types.js').PackageProcessingResult} PackageProcessingResult */
/** @typedef {import('./types.js').PluginSharedState} PluginSharedState */
/** @typedef {import('./types.js').PluginConfigureContext} PluginConfigureContext */
/** @typedef {import('./types.js').PluginContributeEntriesContext} PluginContributeEntriesContext */
/** @typedef {import('./types.js').PluginPackageContext} PluginPackageContext */
/** @typedef {import('./types.js').PluginTsConfigContext} PluginTsConfigContext */
/** @typedef {import('./types.js').PluginRollupContext} PluginRollupContext */
/** @typedef {import('./types.js').PluginOutputContext} PluginOutputContext */
/** @typedef {import('./types.js').PluginBuildEndContext} PluginBuildEndContext */
/** @typedef {import('./types.js').PkgbldPluginFactory} PkgbldPluginFactory */
/** @typedef {import('./types.js').Provider} Provider */
/** @typedef {import('./types.js').ProvideFunction} ProvideFunction */
/** @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin */
