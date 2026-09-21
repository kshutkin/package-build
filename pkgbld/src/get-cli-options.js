import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';

import { cliFlags, cliFlagsDefaults as defaults } from './options/index.js';

/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {ReturnType<typeof import('./build-plugin-lifecycle.js').createBuildPluginLifecycle>} BuildPluginLifecycle
 */

/**
 * @param {BuildPluginLifecycle} pluginLifecycle
 * @param {PackageJson} pkg
 */
export function getCliOptions(pluginLifecycle, pkg) {
    const cliOptions = parseArgsPlus(
        {
            name: 'pkgbld',
            version: pkg.version ?? '<unknown>',
            options: cliFlags,
            allowNegative: true,
        },
        [help, camelCase, customValue]
    );

    const flags = cliOptions.values;

    const options = {
        umdInputs: [...(flags.umd ?? defaults.umd)],
        umdOverridden: flags.umd != null,
        compressFormats: [...(flags.compress ?? defaults.compress)],
        sourcemapFormats: [...(flags.sourcemaps ?? defaults.sourcemaps)],
        formats: [...(flags.formats ?? defaults.formats)],
        formatsOverridden: flags.formats != null,
        preprocess: [...(flags.preprocess ?? defaults.preprocess)],
        dir: flags.dest,
        sourceDir: flags.src,
        bin: flags.bin,
        includeExternals: flags.includeExternals ?? defaults.includeExternals,
        eject: flags.eject,
        tsConfig: flags.tsConfig,
        updatePackageJson: flags.updatePackageJson,
        commonjsPattern: flags.commonjsPattern,
        esPattern: flags.esmPattern,
        umdPattern: flags.umdPattern,
        formatPackageJson: flags.formatPackageJson,
        pack: flags.pack,
        exports: flags.exports,
        clean: flags.clean,
        bundle: flags.bundle,
        removeLegalComments: flags.removeLegalComments,
    };

    pluginLifecycle.applyOptions(flags, options);

    return /** @type {CliOptions} */ (options);
}
