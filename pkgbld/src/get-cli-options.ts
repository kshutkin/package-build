import { cli } from 'cleye';
import { PackageJson, PkgbldPlugin } from './types';
import { cliFlags, cliFlagsDefaults as defaults } from 'options';

export function getCliOptions(plugins: Partial<PkgbldPlugin>[], pkg: PackageJson) {
    const cliOptions = cli({
        name: 'pkgbld',
        version: pkg.version ?? '<unknown>',
        flags: cliFlags
    });

    const flags = cliOptions.flags;

    const options = {
        umdInputs: flags.umd,
        compressFormats: flags.compress,
        sourcemapFormats: flags.sourcemaps,
        formats: flags.formats,
        formatsOverridden: flags.formats !== defaults.formats,
        preprocess: flags.preprocess,
        dir: flags.dir,
        sourceDir: flags.sourceDir,
        bin: flags.bin,
        includeExternals: flags.includeExternals,
        eject: flags.eject,
        noTsConfig: flags.noTsConfig,
        noUpdatePackageJson: flags.noUpdatePackageJson,
        commonjsPattern: flags.commonjsPattern,
        esPattern: flags.esmPattern,
        umdPattern: flags.umdPattern
    };

    for (const plugin of plugins) {
        plugin.options?.(flags, options);
    }

    return options as {
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
        umdPattern: string
    };
}