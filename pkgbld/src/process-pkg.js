import path from 'node:path';

import { createLogger, LogLevel } from '@niceties/logger';

import { isExists } from './helpers.js';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').JsonValue} JsonValue
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 */

/** @type {Set<string>} */
const emptySet = new Set();
const sourceFileSuffixes = /** @type {const} */ (['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs']);

/**
 * @param {JsonObject} pkg
 * @param {CliOptions} config
 * @param {Partial<PkgbldPlugin>[]} plugins
 * @param {JsonObject} [tsConfig]
 * @returns {Promise<[string[], Map<string, (typeof sourceFileSuffixes)[number]>]>}
 */
export async function processPackage(pkg, config, plugins, tsConfig) {
    const typingsFilePattern = '[name].d.ts';

    const indexId = 'index';

    /** @type {Set<string>} */
    const typesVersionsLastFields = new Set(['*']);

    const isDeclarations =
        typeof tsConfig === 'object' &&
        tsConfig != null &&
        'compilerOptions' in tsConfig &&
        typeof tsConfig.compilerOptions === 'object' &&
        tsConfig.compilerOptions !== null &&
        'declaration' in tsConfig.compilerOptions &&
        tsConfig.compilerOptions.declaration === true;

    /** @type {string[]} */
    const inputs = [];
    /** @type {Map<string, (typeof sourceFileSuffixes)[number]>} */
    const inputsExt = new Map();
    const logger = createLogger();
    const allowEsm = (config.formatsOverridden && config.formats.includes('es')) || !config.formatsOverridden;
    const allowCjs = (config.formatsOverridden && config.formats.includes('cjs')) || !config.formatsOverridden;
    const allowUmd = (config.formatsOverridden && config.formats.includes('umd')) || !config.formatsOverridden || config.umdInputs;

    if (typeof pkg !== 'object' || Array.isArray(pkg) || pkg == null) {
        logger.finish('expecting object on top level of package.json', LogLevel.error);
        process.exit(-1);
    }

    if (typeof pkg.name !== 'string' && config.umdInputs.length > 0) {
        logger.finish('expecting name to be a string in package.json', LogLevel.error);
        process.exit(-1);
    }

    if (!Array.isArray(pkg.files)) {
        pkg.files = [];
    }

    if (!pkg.files.includes(config.dir)) {
        /** @type {string[]} */ (pkg.files).push(config.dir);
    }

    if (typeof pkg.scripts !== 'object' && pkg.scripts !== null) {
        pkg.scripts = {};
    }

    if (config.pack && !('prepack' in /** @type {Record<string, JsonObject>} */ (pkg.scripts))) {
        /** @type {Record<string, JsonValue>} */ (pkg.scripts).prepack = 'pkgprn';
    }

    if (allowEsm && !allowCjs && typeof pkg.type !== 'string') {
        pkg.type = 'module';
    }

    const exportsFields = new Set([
        'types',
        'svelte',
        pkg.type === 'module' ? 'require' : 'import',
        pkg.type === 'module' ? 'import' : 'require',
        'default',
    ]);

    if (typeof pkg.typings === 'string') {
        /** @type {Record<string, unknown>} */ (pkg).typings = undefined;
    }

    if (isDeclarations) {
        pkg.types = `./${config.dir}/${patternToName(typingsFilePattern, 'index')}`;
    }

    if (allowUmd && typeof pkg.umd === 'string') {
        pkg.umd = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
        if (!config.umdInputs.includes(indexId)) {
            config.umdInputs.push(indexId);
        }
    }

    if (allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.commonjsPattern, indexId)}`;
    }

    if (allowEsm && !allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }

    if (allowCjs && allowEsm && typeof pkg.module !== 'string') {
        pkg.module = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }

    if (allowUmd && config.umdInputs.includes(indexId)) {
        pkg.unpkg = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
    }

    if (isDeclarations) {
        if (typeof pkg.typesVersions !== 'object' && pkg.typesVersions !== null) {
            pkg.typesVersions = {};
        }

        if (
            typeof (/** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*']) !== 'object' &&
            /** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*'] !== null
        ) {
            /** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*'] = {};
        }
    }

    if (config.exports) {
        if (typeof pkg.exports !== 'object' && pkg.exports !== null) {
            pkg.exports = {};
        }

        if (/** @type {Record<string, JsonValue>} */ (pkg.exports)['.'] == null) {
            /** @type {Record<string, JsonValue>} */ (pkg.exports)['.'] = {};
        }

        /** @type {Record<string, JsonValue>} */ (pkg.exports)['./package.json'] = './package.json';

        if (
            allowCjs &&
            pkg.main !== /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)['.']).require
        ) {
            /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)['.']).require =
                /** @type {JsonValue} */ (pkg.main);
        }

        if (
            pkg.module !== /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)['.'])?.default
        ) {
            /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)['.']).default =
                /** @type {JsonValue} */ (pkg.module);
        }

        for (const id in /** @type {object} */ (pkg.exports)) {
            if (id === './package.json') continue;

            const basename = id === '.' ? indexId : path.join(path.dirname(id), path.basename(id));

            if (typeof (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id]) !== 'object') {
                /** @type {Record<string, JsonValue>} */ (pkg.exports)[id] = {};
            }

            if (isDeclarations) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*'])[id] = [
                    `${config.dir}/${patternToName(typingsFilePattern, basename)}`,
                ];

                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id]).types =
                    `./${config.dir}/${patternToName(typingsFilePattern, basename)}`;
            }

            const cjsFieldName = pkg.type === 'module' ? 'require' : 'default';
            const esmFieldName = pkg.type === 'module' ? 'default' : 'import';

            if (allowEsm) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[esmFieldName] =
                    `./${config.dir}/${patternToName(config.esPattern, basename)}`;
            }

            if (allowCjs) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[cjsFieldName] =
                    `./${config.dir}/${patternToName(config.commonjsPattern, basename)}`;
            }

            /** @type {Record<string, JsonValue>} */ (pkg.exports)[id] = orderFields(
                exportsFields,
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])
            );

            if (basename !== indexId && config.subpackages) {
                if (!pkg.files.includes(basename)) {
                    /** @type {string[]} */ (pkg.files).push(basename);
                }
            }

            await updateExtensions(basename);
        }
    } else {
        await updateExtensions(indexId);
    }

    if (isDeclarations) {
        /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*'])['*'] = [
            `${config.dir}/${patternToName(typingsFilePattern, indexId)}`,
            `${config.dir}/*`,
        ];

        /** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*'] = orderFields(
            emptySet,
            /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.typesVersions)['*']),
            typesVersionsLastFields
        );
    }

    if (allowUmd && config.umdInputs.length > 0 && !config.formats.includes('umd')) {
        config.formats.push('umd');
    }

    for (const plugin of plugins) {
        plugin.processPackageJson?.(/** @type {PackageJson} */ (pkg), inputs);
    }

    if (config.bin) {
        if (config.bin.length > 0) {
            if (config.bin[0] !== '') {
                pkg.bin = /** @type {string} */ (config.bin[0]);
            }
            config.bin = config.bin.filter(Boolean);
            if (config.bin.length === 0) {
                config.bin = undefined;
            }
        }
    } else if (allowCjs && inputs.length > 0) {
        if (typeof pkg.bin === 'string') {
            if (
                inputs.some(
                    input =>
                        pkg.bin === `./${config.dir}/${patternToName(config.commonjsPattern, path.basename(input, path.extname(input)))}`
                )
            ) {
                config.bin = [pkg.bin];
            }
        } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            const executables = /** @type {string[]} */ (
                Object.values(pkg.bin).filter(
                    value =>
                        typeof value === 'string' &&
                        inputs.some(
                            input =>
                                value ===
                                `./${config.dir}/${patternToName(config.commonjsPattern, path.basename(input, path.extname(input)))}`
                        )
                )
            );
            if (executables.length > 0) {
                config.bin = executables;
            }
        }
        if (
            typeof pkg.directories === 'object' &&
            pkg.directories != null &&
            'bin' in pkg.directories &&
            typeof pkg.directories.bin === 'string'
        ) {
            if (path.resolve(pkg.directories.bin) === path.resolve(config.dir)) {
                config.bin?.push(...inputs.map(input => `./${config.dir}/${patternToName(config.commonjsPattern, input)}`));
                config.bin = Array.from(new Set(config.bin));
            }
        }
    }

    return [inputs, inputsExt];

    /**
     * @param {string} id
     */
    async function updateExtensions(id) {
        const sourceFileWithoutSuffix = `./${config.sourceDir}/${id}.`;

        for (const suffix of sourceFileSuffixes) {
            const file = sourceFileWithoutSuffix + suffix;
            if (await isExists(file)) {
                inputs.push(file);
                inputsExt.set(id, suffix);
                break;
            }
        }
    }
}

/**
 * @param {string} pattern
 * @param {string} input
 * @returns {string}
 */
function patternToName(pattern, input) {
    return pattern.replace('[name]', input);
}

/**
 * @template {object} T
 * @param {Set<string>} firstFields
 * @param {T} exports
 * @param {Set<string>} [lastFields]
 * @returns {T}
 */
function orderFields(firstFields, exports, lastFields = emptySet) {
    const ordered = /** @type {T} */ ({});

    for (const key of firstFields) {
        if (/** @type {keyof T} */ (key) in exports) {
            /** @type {Record<string, unknown>} */ (ordered)[key] = /** @type {Record<string, unknown>} */ (exports)[key];
        }
    }

    for (const key in exports) {
        if (!firstFields.has(key) && !lastFields.has(key)) {
            /** @type {Record<string, unknown>} */ (ordered)[key] = /** @type {Record<string, unknown>} */ (exports)[key];
        }
    }

    for (const key of lastFields) {
        if (/** @type {keyof T} */ (key) in exports) {
            /** @type {Record<string, unknown>} */ (ordered)[key] = /** @type {Record<string, unknown>} */ (exports)[key];
        }
    }

    return ordered;
}
