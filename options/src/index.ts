import typia from 'typia';
import { PackageJson } from './types';

export function isPackageJson(value: unknown) : value is PackageJson {
    return typia.is<PackageJson>(value);
}

function CommaSeparatedString(value: string) {
    return value.split(',').map((arg: string) => arg.trim());
}

function CommaSeparatedStringOrBoolean(value: string | boolean) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value) && value.length === 0) {
        return true;
    }
    return CommaSeparatedString(value);
}

export const cliFlagsDefaults = {
    formats: ['es', 'cjs'],
    umdInputs: [] as string[],
    compressFormats: ['umd'],
    sourcemapFormats: ['umd'],
    preprocess: [],
    dir: 'dist',
    sourceDir: 'src',
    includeExternals: false as boolean | string[],
    eject: false,
    noTsConfig: false,
    noUpdatePackageJson: false,
    commonjsPattern: '[name].cjs',
    esPattern: '[name].mjs',
    umdPattern: '[name].umd.js',
    formatPackageJson: false
};

export const cliFlags = {
    umd: {
        type: CommaSeparatedString,
        description: 'Package subpath exports in UMD format',
        default: cliFlagsDefaults.umdInputs
    },
    compress: {
        type: CommaSeparatedString,
        description: 'Compress formats using terser',
        default: cliFlagsDefaults.compressFormats
    },
    sourcemaps: {
        type: CommaSeparatedString,
        description: 'Emit sourcemaps for the specified formats',
        default: cliFlagsDefaults.sourcemapFormats
    },
    formats: {
        type: CommaSeparatedString,
        description: 'Formats to emit',
        default: cliFlagsDefaults.formats
    },
    preprocess: {
        type: CommaSeparatedString,
        description: 'Preprocess entry points / subpath exports',
        default: cliFlagsDefaults.preprocess
    },
    dir: {
        type: String,
        description: 'Output directory',
        default: cliFlagsDefaults.dir
    },
    sourceDir: {
        type: String,
        description: 'Source directory',
        default: cliFlagsDefaults.sourceDir
    },
    bin: {
        type: CommaSeparatedString,
        description: 'Executable files'
    },
    includeExternals: {
        type: CommaSeparatedStringOrBoolean,
        description: 'Include all/specified externals into result bundle(s)',
        default: cliFlagsDefaults.includeExternals
    },
    eject: {
        type: Boolean,
        description: 'Eject config',
        default: cliFlagsDefaults.eject
    },
    noTsConfig: {
        type: Boolean,
        description: 'Do not create / update tsconfig.json',
        default: cliFlagsDefaults.noTsConfig
    },
    noUpdatePackageJson: {
        type: Boolean,
        description: 'Do not create / update package.json',
        default: cliFlagsDefaults.noUpdatePackageJson
    },
    commonjsPattern: {
        type: String,
        description: 'CommonJS output file name pattern',
        default: cliFlagsDefaults.commonjsPattern
    },
    esmPattern: {
        type: String,
        description: 'ES output file name pattern',
        default: cliFlagsDefaults.esPattern
    },
    umdPattern: {
        type: String,
        description: 'UMD output file name pattern',
        default: cliFlagsDefaults.umdPattern
    },
    formatPackageJson: {
        type: Boolean,
        description: 'Format package.json',
        default: cliFlagsDefaults.formatPackageJson
    }
};

export const packageJsonFieldsOrder = new Set([
    'private',
    'type',
    'version',
    'name',
    'description',
    'license',
    'author',
    'contributors',
    'funding',
    'bin',
    'main',
    'browser',
    'unpkg',
    'module',
    'exports',
    'imports',
    'types',
    'typings',
    'files',
    'packageManager',
    'sideEffects',
    'engines',
    'os',
    'cpu',
    'man',
    'directories',
    'repository',
    'bugs',
    'homepage',
    'readme',
    'keywords',
    'scripts',
    'config',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'bundleDependencies',
    'bundledDependencies',
    'optionalDependencies',
    'overrides',
    'publishConfig',
    'workspaces'
]);

export function processPackageJson(pkg: PackageJson, needTreatment: (key: string) => boolean, treatKey: (key: string) => unknown) {
    const newPkg: PackageJson = {};

    for (const key of packageJsonFieldsOrder) {
        if (needTreatment(key)) {
            (newPkg as Record<string, unknown>)[key] = treatKey(key);
        }
    }

    for (const key in pkg) {
        if (!packageJsonFieldsOrder.has(key)) {
            (newPkg as Record<string, unknown>)[key] = (pkg as Record<string, unknown>)[key];
        }
    }

    return newPkg;
}

export function toFormattedJson<T extends object | null | number | string | boolean>(json: T) {
    return JSON.stringify(json, null, 2) + '\n';
}