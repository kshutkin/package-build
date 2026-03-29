import { cliFlags, cliFlagsDefaults as defaults } from 'options';

import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { commands } from '@niceties/node-parseargs-plus/commands';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';
import { optionalValue } from '@niceties/node-parseargs-plus/optional-value';

/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 */

/**
 * @param {string} value
 * @returns {true | string}
 */
function FlattenParam(value) {
    if (value === '') {
        return true; // means auto
    }
    return value; // string
}

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
            commands: {
                prune: {
                    description: 'prune devDependencies and redundant scripts from package.json',
                    options: {
                        profile: {
                            type: /** @type {'string'} */ ('string'),
                            description: 'profile to use',
                            default: 'library',
                        },
                        flatten: {
                            type: FlattenParam,
                            description: 'flatten package files',
                            optionalValue: true,
                        },
                        removeSourcemaps: {
                            type: /** @type {'boolean'} */ ('boolean'),
                            description: 'remove sourcemaps',
                            default: false,
                        },
                        noOptimizeFiles: {
                            type: /** @type {'boolean'} */ ('boolean'),
                            description: 'do not optimize files array',
                            default: false,
                        },
                    },
                },
            },
        },
        [help, commands, camelCase, customValue, optionalValue]
    );

    if (cliOptions.command === 'prune') {
        return /** @type {const} */ ({
            kind: 'prune',
            profile: cliOptions.values.profile,
            flatten: cliOptions.values.flatten ?? false,
            removeSourcemaps: cliOptions.values.removeSourcemaps,
            optimizeFiles: !cliOptions.values.noOptimizeFiles,
        });
    }
    const flags = cliOptions.values;

    const options = {
        kind: /** @type {'build'} */ ('build'),
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
        noTsConfig: flags.noTsConfig,
        noUpdatePackageJson: flags.noUpdatePackageJson,
        commonjsPattern: flags.commonjsPattern,
        esPattern: flags.esmPattern,
        umdPattern: flags.umdPattern,
        formatPackageJson: flags.formatPackageJson,
        noPack: flags.noPack,
        noExports: flags.noExports,
        noClean: flags.noClean,
        noBundle: flags.noBundle,
        removeLegalComments: flags.removeLegalComments,
        noSubpackages: flags.noSubpackages,
    };

    for (const plugin of plugins) {
        plugin.options?.(flags, options);
    }

    return /** @type {{kind: 'build', umdInputs: string[], compressFormats: string[], sourcemapFormats: string[], formats: string[], formatsOverridden: boolean, preprocess: string[], dir: string, sourceDir: string, bin?: string[], includeExternals: boolean | string[], eject: boolean, noTsConfig: boolean, noUpdatePackageJson: boolean, commonjsPattern: string, esPattern: string, umdPattern: string, formatPackageJson: boolean, noPack: boolean, noExports: boolean, noClean: boolean, noBundle: boolean, removeLegalComments: boolean, noSubpackages: boolean}} */ (
        options
    );
}
