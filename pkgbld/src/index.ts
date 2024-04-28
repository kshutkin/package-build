import '@niceties/draftlog-appender';
import { createLogger, LogLevel } from '@niceties/logger';
import { rollup, RollupOptions } from 'rollup';
import { createSubpackages } from './create-subpackages';
import { getCliOptions } from './get-cli-options';
import { getJson } from './get-json';
import { getRollupConfigs } from './get-rollup-configs';
import { formatInput, formatOutput, getHelpers, getTimeDiff, toArray, formatPackageJson } from './helpers';
import { mainLoggerText } from './messages';
import { processPackage } from './process-pkg';
import { writeJson } from './write-json';
import kleur from 'kleur';
import { createProvider } from './get-plugins';
import { createEjectProvider, ejectConfig } from './eject';
import { checkTsConfig } from './process-ts-config';
import { PkgbldPlugin } from './types';
import { loadPlugins } from './load-plugins';
import { prunePkg } from './prune';
import { PackageJson } from 'options';

execute();

async function execute() {
    const time = Date.now();
    const mainLogger = createLogger();
    mainLogger.update('preparing..');
    try {
        let pkg: PackageJson;
        let pkgPath: string;
        // eslint-disable-next-line prefer-const
        [pkgPath, pkg] = await getJson('package.json') as [string, PackageJson];
        const plugins = await loadPlugins(pkg);
        mainLogger.update('');
        process.stdout.moveCursor?.(0, -1);
        const options = getCliOptions(plugins, pkg);
        if (options.kind === 'prune') {
            await prunePkg(pkg, options, mainLogger);
            await writeJson(pkgPath, pkg);
            process.exit(0);
        }
        process.stdout.moveCursor?.(0, 1);
        mainLogger.update('preparing...');
        const tsConfig = await checkTsConfig(options, mainLogger, plugins);
        const [inputs, inputsExt] = await processPackage(pkg, options, plugins, tsConfig);
        if (options.formatPackageJson) {
            pkg = formatPackageJson(pkg);
        }
        const helpers = getHelpers((pkg as { name: string }).name);
        const preimportMap = preimport();
        const provider = options.eject ? await createEjectProvider(preimportMap) : createProvider(preimportMap);
        const rollupConfigs = await getRollupConfigs(provider, inputs, inputsExt, options, helpers, plugins);

        if (options.noBundle) {
            rollupConfigs.length = 0;
        }

        if (options.eject) {
            await ejectConfig(rollupConfigs, pkgPath, options, inputs, inputsExt, helpers, pkg);
            mainLogger.finish(`ejected config in ${getTimeDiff(time)}`);
            if (!options.noUpdatePackageJson) {
                await writeJson(pkgPath, pkg);
            }
        } else {
            const updater = mainLoggerText(options.sourceDir, options.dir, rollupConfigs.length, time);
            mainLogger.start(updater());
        
            await Promise.all(rollupConfigs.map(config => buildConfig(config, updater)));

            if (!options.noUpdatePackageJson) {
                await writeJson(pkgPath, pkg);
            }
            await createSubpackages(inputs, options);

            await Promise.all(
                plugins
                    .filter(plugin => plugin.buildEnd)
                    .map(plugin => (plugin as Required<PkgbldPlugin>).buildEnd())
            );

            mainLogger.finish(updater(true));
        }
    } catch(e) {
        mainLogger.finish(JSON.stringify(e), LogLevel.error);
        process.exit(-1);
    }

    async function buildConfig(config: RollupOptions, updater: () => string) {
        const bundle = await rollup(config);
        await Promise.all(toArray(config.output).map(config => bundle.write(config)));
        await bundle.close();
        mainLogger(`${kleur.green('✓')} ${formatInput(config.input as string | string[])} [${formatOutput(config.output, 'format')}]`);
        mainLogger.update(updater());
    }
}

function preimport() {
    return (process.env.PKGBLD_INTERNAL ? new Map([
        ['@rollup-extras/plugin-binify', import('@rollup-extras/plugin-binify')],
        ['@rollup-extras/plugin-clean', import('@rollup-extras/plugin-clean')],
        ['@rollup-extras/plugin-externals', import('@rollup-extras/plugin-externals')]
    ]) : new Map) as Map<string, Promise<never>>;
}

export * from './types';
export * from './options-types';