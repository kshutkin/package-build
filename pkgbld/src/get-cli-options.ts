import { cli, command } from 'cleye';
import { PackageJson, PkgbldPlugin } from './types';
import { cliFlags, cliFlagsDefaults as defaults } from 'options';

export function getCliOptions(plugins: Partial<PkgbldPlugin>[], pkg: PackageJson) {
    const cliOptions = cli({
        name: 'pkgbld',
        version: pkg.version ?? '<unknown>',
        flags: cliFlags,
        commands: [
            command({
                name: 'prune',
                description: 'prune devDependencies and redundunt scripts from package.json',
                flags: {
                    profile: {
                        type: String,
                        description: 'profile to use',
                        default: 'library'
                    }
                }
            })
        ]
    });

    if (cliOptions.command === 'prune') {
        return {
            kind: 'prune',
            profile: cliOptions.flags.profile
        } as const;
    } else {
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
            formatPackageJson: flags.formatPackageJson
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
            formatPackageJson: boolean
        };
    }
}