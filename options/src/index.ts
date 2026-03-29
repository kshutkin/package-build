import typia from 'typia';

import { PackageJson } from './types';

export { PackageJson };

export function isPackageJson(value: unknown): value is PackageJson {
    return typia.is<PackageJson>(value);
}

function CommaSeparatedString(value: string) {
    if (value === '') return [];
    return value.split(',').map((arg: string) => arg.trim());
}

function CommaSeparatedStringOrBoolean(value: string) {
    if (value === '') {
        return true;
    }
    return CommaSeparatedString(value);
}

export const cliFlagsDefaults = {
    formats: ['es', 'cjs'],
    umd: [] as string[],
    compress: ['umd'],
    sourcemaps: ['umd'],
    preprocess: [] as string[],
    dest: 'dist',
    src: 'src',
    bin: undefined as string[] | undefined,
    includeExternals: false as boolean | string[],
    eject: false,
    noTsConfig: false,
    noUpdatePackageJson: false,
    commonjsPattern: '[name].cjs',
    esmPattern: '[name].mjs',
    umdPattern: '[name].umd.js',
    formatPackageJson: false,
    noSubpackages: false,
};

export const cliFlags = {
    umd: {
        type: CommaSeparatedString,
        description: 'Package subpath exports in UMD format',
    },
    compress: {
        type: CommaSeparatedString,
        description: 'Compress formats using terser',
    },
    sourcemaps: {
        type: CommaSeparatedString,
        description: 'Emit sourcemaps for the specified formats',
    },
    formats: {
        type: CommaSeparatedString,
        description: 'Formats to emit',
    },
    preprocess: {
        type: CommaSeparatedString,
        description: 'Preprocess entry points / subpath exports',
    },
    dest: {
        type: 'string' as const,
        description: 'Output directory',
        default: cliFlagsDefaults.dest,
    },
    src: {
        type: 'string' as const,
        description: 'Source directory',
        default: cliFlagsDefaults.src,
    },
    bin: {
        type: CommaSeparatedString,
        description: 'Executable files',
    },
    includeExternals: {
        type: CommaSeparatedStringOrBoolean,
        description: 'Include all/specified externals into the result bundle(s)',
        optionalValue: true,
    },
    eject: {
        type: 'boolean' as const,
        description: 'Eject config',
        default: cliFlagsDefaults.eject,
    },
    noTsConfig: {
        type: 'boolean' as const,
        description: 'Do not create / update tsconfig.json',
        default: cliFlagsDefaults.noTsConfig,
    },
    noUpdatePackageJson: {
        type: 'boolean' as const,
        description: 'Do not create / update package.json',
        default: cliFlagsDefaults.noUpdatePackageJson,
    },
    commonjsPattern: {
        type: 'string' as const,
        description: 'CommonJS output file name pattern',
        default: cliFlagsDefaults.commonjsPattern,
    },
    esmPattern: {
        type: 'string' as const,
        description: 'ES output file name pattern',
        default: cliFlagsDefaults.esmPattern,
    },
    umdPattern: {
        type: 'string' as const,
        description: 'UMD output file name pattern',
        default: cliFlagsDefaults.umdPattern,
    },
    formatPackageJson: {
        type: 'boolean' as const,
        description: 'Format package.json',
        default: cliFlagsDefaults.formatPackageJson,
    },
    noPack: {
        type: 'boolean' as const,
        description: 'Do not pack',
        default: false,
    },
    noExports: {
        type: 'boolean' as const,
        description: 'Do not add exports field to package.json',
        default: false,
    },
    noClean: {
        type: 'boolean' as const,
        description: 'Do not clean the output directory',
        default: false,
    },
    noBundle: {
        type: 'boolean' as const,
        description: 'Do not bundle',
        default: false,
    },
    removeLegalComments: {
        type: 'boolean' as const,
        description: 'Remove legal comments',
        default: false,
    },
    noSubpackages: {
        type: 'boolean' as const,
        description: 'Do not create subpackage directories with package.json files',
        default: cliFlagsDefaults.noSubpackages,
    },
};

export const packageJsonFieldsOrder = new Set([
    'private',
    'type',
    'version',
    'name',
    'scope', // custom
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
    'svelte',
    'exports',
    'imports',
    'types',
    'typings',
    'typesVersions', // non standard but required for typescript with resolution other than nodenext
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
    'workspaces',
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
    return `${JSON.stringify(json, null, 2)}\n`;
}
