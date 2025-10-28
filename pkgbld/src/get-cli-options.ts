import { cli, command } from 'cleye';
import type { PkgbldPlugin } from './types';
import { cliFlags, cliFlagsDefaults as defaults } from 'options';
import type { PackageJson } from 'type-fest';

function FlattenParam(value: string | false) {
    if (typeof value === 'boolean') {
        return value; // false
    }
    if (value === '') {
        return true; // means auto
    }
    return value; // string
}

export function getCliOptions(plugins: Partial<PkgbldPlugin>[], pkg: PackageJson) {
    const cliOptions = cli({
        name: 'pkgbld',
        version: pkg.version ?? '<unknown>',
        flags: cliFlags,
        commands: [
            command({
                name: 'prune',
                description: 'prune devDependencies and redundant scripts from package.json',
                flags: {
                    profile: {
                        type: String,
                        description: 'profile to use',
                        default: 'library'
                    },
                    flatten: {
                        type: FlattenParam,
                        description: 'flatten package files',
                        default: false
                    },
                    removeSourcemaps: {
                        type: Boolean,
                        description: 'remove sourcemaps',
                        default: false
                    },
                    optimizeFiles: {
                        type: Boolean,
                        description: 'optimize files array',
                        default: true
                    }
                }
            })
        ]
    });

    if (cliOptions.command === 'prune') {
        return {
            kind: 'prune',
            profile: cliOptions.flags.profile,
            flatten: cliOptions.flags.flatten,
            removeSourcemaps: cliOptions.flags.removeSourcemaps,
            optimizeFiles: cliOptions.flags.optimizeFiles
        } as const;
    }
    const flags = cliOptions.flags;

    const options = {
        kind: 'build' as const,
        umdInputs: flags.umd,
        compressFormats: flags.compress,
        sourcemapFormats: flags.sourcemaps,
        formats: flags.formats,
        formatsOverridden: flags.formats !== defaults.formats,
        preprocess: flags.preprocess,
        dir: flags.dest,
        sourceDir: flags.src,
        bin: flags.bin,
        includeExternals: flags.includeExternals,
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
        noSubpackages: flags.noSubpackages
    };

    for (const plugin of plugins) {
        plugin.options?.(flags, options);
    }

    return options as {
        kind: 'build',
        umdInputs: string[],
        compressFormats: string[],
        sourcemapFormats: string[],
        formats: string[],
        formatsOverridden: boolean,
        preprocess: string[],
        dir: string,
        sourceDir: string,
        bin?: string[],
        includeExternals: boolean | string[],
        eject: boolean,
        noTsConfig: boolean,
        noUpdatePackageJson: boolean,
        commonjsPattern: string,
        esPattern: string,
        umdPattern: string,
        formatPackageJson: boolean,
        noPack: boolean,
        noExports: boolean,
        noClean: boolean,
        noBundle: boolean,
        removeLegalComments: boolean,
        noSubpackages: boolean
    };
}
