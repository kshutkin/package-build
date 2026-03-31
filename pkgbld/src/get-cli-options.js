import { cliFlags, cliFlagsDefaults as defaults } from 'options';

import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';

/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 */

/**
 * @param {Partial<PkgbldPlugin>[]} plugins
 * @param {PackageJson} pkg
 */
export function getCliOptions(plugins, pkg) {
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
        umdInputs: flags.umd ?? defaults.umd,
        compressFormats: flags.compress ?? defaults.compress,
        sourcemapFormats: flags.sourcemaps ?? defaults.sourcemaps,
        formats: flags.formats ?? defaults.formats,
        formatsOverridden: flags.formats != null,
        preprocess: flags.preprocess ?? defaults.preprocess,
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

    for (const plugin of plugins) {
        plugin.options?.(flags, options);
    }

    return /** @type {{umdInputs: string[], compressFormats: string[], sourcemapFormats: string[], formats: string[], formatsOverridden: boolean, preprocess: string[], dir: string, sourceDir: string, bin?: string[], includeExternals: boolean | string[], eject: boolean, tsConfig: boolean, updatePackageJson: boolean, commonjsPattern: string, esPattern: string, umdPattern: string, formatPackageJson: boolean, pack: boolean, exports: boolean, clean: boolean, bundle: boolean, removeLegalComments: boolean}} */ (
        options
    );
}
