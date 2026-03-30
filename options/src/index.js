/** @typedef {import('./types.js').PackageJson} PackageJson */

/**
 * @param {unknown} value
 * @returns {value is PackageJson}
 */
export function isPackageJson(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const obj = /** @type {Record<string, unknown>} */ (value);
    if (obj.private !== undefined && typeof obj.private !== 'boolean') return false;
    if (obj.version !== undefined && typeof obj.version !== 'string') return false;
    if (obj.name !== undefined && typeof obj.name !== 'string') return false;
    if (obj.main !== undefined && typeof obj.main !== 'string') return false;
    if (obj.license !== undefined && typeof obj.license !== 'string') return false;
    if (obj.readme !== undefined && typeof obj.readme !== 'string') return false;
    if (obj.description !== undefined && typeof obj.description !== 'string') return false;
    if (obj.bugs !== undefined && typeof obj.bugs !== 'string') return false;
    if (obj.homepage !== undefined && typeof obj.homepage !== 'string') return false;
    if (obj.bin !== undefined && typeof obj.bin !== 'string' && (typeof obj.bin !== 'object' || obj.bin === null || Array.isArray(obj.bin)))
        return false;
    if (
        obj.author !== undefined &&
        typeof obj.author !== 'string' &&
        (typeof obj.author !== 'object' || obj.author === null || Array.isArray(obj.author))
    )
        return false;
    return true;
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function CommaSeparatedString(value) {
    if (value === '') return [];
    return value.split(',').map((/** @type {string} */ arg) => arg.trim());
}

/**
 * @param {string} value
 * @returns {true | string[]}
 */
function CommaSeparatedStringOrBoolean(value) {
    if (value === '') {
        return true;
    }
    return CommaSeparatedString(value);
}

export const cliFlagsDefaults = {
    formats: /** @type {string[]} */ (['es', 'cjs']),
    umd: /** @type {string[]} */ ([]),
    compress: /** @type {string[]} */ (['umd']),
    sourcemaps: /** @type {string[]} */ (['umd']),
    preprocess: /** @type {string[]} */ ([]),
    dest: 'dist',
    src: 'src',
    bin: /** @type {string[] | undefined} */ (undefined),
    includeExternals: /** @type {boolean | string[]} */ (false),
    eject: false,
    tsConfig: true,
    updatePackageJson: true,
    commonjsPattern: '[name].cjs',
    esmPattern: '[name].mjs',
    umdPattern: '[name].umd.js',
    formatPackageJson: false,
    subpackages: true,
};

export const cliFlags = {
    umd: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Package subpath exports in UMD format',
    },
    compress: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Compress formats using terser',
    },
    sourcemaps: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Emit sourcemaps for the specified formats',
    },
    formats: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Formats to emit',
    },
    preprocess: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Preprocess entry points / subpath exports',
    },
    dest: {
        type: /** @type {'string'} */ ('string'),
        description: 'Output directory',
        default: cliFlagsDefaults.dest,
    },
    src: {
        type: /** @type {'string'} */ ('string'),
        description: 'Source directory',
        default: cliFlagsDefaults.src,
    },
    bin: {
        type: /** @type {(value: string) => string[]} */ (CommaSeparatedString),
        description: 'Executable files',
    },
    includeExternals: {
        type: /** @type {(value: string) => true | string[]} */ (CommaSeparatedStringOrBoolean),
        description: 'Include all/specified externals into the result bundle(s)',
        optionalValue: true,
    },
    eject: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Eject config',
        default: cliFlagsDefaults.eject,
    },
    tsConfig: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Create / update tsconfig.json',
        default: cliFlagsDefaults.tsConfig,
    },
    updatePackageJson: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Create / update package.json',
        default: cliFlagsDefaults.updatePackageJson,
    },
    commonjsPattern: {
        type: /** @type {'string'} */ ('string'),
        description: 'CommonJS output file name pattern',
        default: cliFlagsDefaults.commonjsPattern,
    },
    esmPattern: {
        type: /** @type {'string'} */ ('string'),
        description: 'ES output file name pattern',
        default: cliFlagsDefaults.esmPattern,
    },
    umdPattern: {
        type: /** @type {'string'} */ ('string'),
        description: 'UMD output file name pattern',
        default: cliFlagsDefaults.umdPattern,
    },
    formatPackageJson: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Format package.json',
        default: cliFlagsDefaults.formatPackageJson,
    },
    pack: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Pack',
        default: true,
    },
    exports: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Add exports field to package.json',
        default: true,
    },
    clean: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Clean the output directory',
        default: true,
    },
    bundle: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Bundle',
        default: true,
    },
    removeLegalComments: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Remove legal comments',
        default: false,
    },
    subpackages: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Create subpackage directories with package.json files',
        default: cliFlagsDefaults.subpackages,
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

/**
 * @param {PackageJson} pkg
 * @param {(key: string) => boolean} needTreatment
 * @param {(key: string) => unknown} treatKey
 * @returns {PackageJson}
 */
export function processPackageJson(pkg, needTreatment, treatKey) {
    /** @type {PackageJson} */
    const newPkg = {};

    for (const key of packageJsonFieldsOrder) {
        if (needTreatment(key)) {
            /** @type {Record<string, unknown>} */ (newPkg)[key] = treatKey(key);
        }
    }

    for (const key in pkg) {
        if (!packageJsonFieldsOrder.has(key)) {
            /** @type {Record<string, unknown>} */ (newPkg)[key] = /** @type {Record<string, unknown>} */ (pkg)[key];
        }
    }

    return newPkg;
}

/**
 * @template {object | null | number | string | boolean} T
 * @param {T} json
 * @returns {string}
 */
export function toFormattedJson(json) {
    return `${JSON.stringify(json, null, 2)}\n`;
}
