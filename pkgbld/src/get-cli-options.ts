import { cli } from 'cleye';
import { PackageJson, PkgbldPlugin } from './types';

const defaults = {
    formats: ['es', 'cjs'],
    umdInputs: [] as string[],
    compressFormats: ['umd'],
    sourcemapFormats: ['umd'],
    preprocess: [],
    dir: 'dist',
    sourceDir: 'src',
    includeExternals: false,
    eject: false,
    noTsConfig: false,
    noUpdatePackageJson: false,
    commonjsPattern: '[name].cjs',
    esPattern: '[name].mjs',
    umdPattern: '[name].umd.js'
};

function CommaSeparatedString(value: string) {
    return value.split(',').map((arg: string) => arg.trim());
}

export function getCliOptions(plugins: Partial<PkgbldPlugin>[], pkg: PackageJson) {
    const cliOptions = cli({
        name: 'pkgbld',
        version: pkg.version ?? '<unknown>',
        flags: {
            umd: {
                type: CommaSeparatedString,
                description: 'Package subpath exports in UMD format',
                default: defaults.umdInputs
            },
            compress: {
                type: CommaSeparatedString,
                description: 'Compress formats using terser',
                default: defaults.compressFormats
            },
            sourcemaps: {
                type: CommaSeparatedString,
                description: 'Emit sourcemaps for the specified formats',
                default: defaults.sourcemapFormats
            },
            formats: {
                type: CommaSeparatedString,
                description: 'Formats to emit',
                default: defaults.formats
            },
            preprocess: {
                type: CommaSeparatedString,
                description: 'Preprocess entry points / subpath exports',
                default: defaults.preprocess
            },
            dir: {
                type: String,
                description: 'Output directory',
                default: defaults.dir
            },
            sourceDir: {
                type: String,
                description: 'Source directory',
                default: defaults.sourceDir
            },
            bin: {
                type: CommaSeparatedString,
                description: 'Executable files'
            },
            includeExternals: {
                type: Boolean,
                description: 'Include all externals into result bundle(s)',
                default: defaults.includeExternals
            },
            eject: {
                type: Boolean,
                description: 'Eject config',
                default: defaults.includeExternals
            },
            noTsConfig: {
                type: Boolean,
                description: 'Do not create / update tsconfig.json',
                default: defaults.noTsConfig
            },
            noUpdatePackageJson: {
                type: Boolean,
                description: 'Do not create / update package.json',
                default: defaults.noUpdatePackageJson
            },
            commonjsPattern: {
                type: String,
                description: 'CommonJS output file name pattern',
                default: defaults.commonjsPattern
            },
            esmPattern: {
                type: String,
                description: 'ES output file name pattern',
                default: defaults.esPattern
            },
            umdPattern: {
                type: String,
                description: 'UMD output file name pattern',
                default: defaults.umdPattern
            }
        }
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
        includeExternals: boolean,
        eject: boolean,
        noTsConfig: boolean,
        noUpdatePackageJson: boolean,
        commonjsPattern: string,
        esPattern: string,
        umdPattern: string
    };
}