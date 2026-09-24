import path from 'node:path';

import { createLogger, LogLevel } from '@niceties/logger';

import { isExists } from './helpers.js';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').JsonValue} JsonValue
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').PackageProcessingResult} PackageProcessingResult
 * @typedef {ReturnType<typeof import('./build-plugin-lifecycle.js').createBuildPluginLifecycle>} BuildPluginLifecycle
 */

/** @type {Set<string>} */
const emptySet = new Set();
const sourceFileSuffixes = /** @type {const} */ (['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs']);

/**
 * @param {JsonObject} pkg
 * @param {BuildConfiguration} configuration
 * @param {BuildPluginLifecycle} pluginLifecycle
 * @returns {Promise<PackageProcessingResult>}
 */
export async function processPackage(pkg, configuration, pluginLifecycle) {
    const indexId = 'index';
    const { outputs, packageJson, paths } = configuration;

    /** @type {string[]} */
    const inputs = [];
    /** @type {Map<string, (typeof sourceFileSuffixes)[number]>} */
    const inputsExt = new Map();
    const logger = createLogger();
    /** @type {string[]} */
    let executableOutputs = [];
    const allowEsm = outputs.formats.includes('es');
    const allowCjs = outputs.formats.includes('cjs');
    const allowUmd = outputs.formats.includes('umd');

    if (typeof pkg !== 'object' || Array.isArray(pkg) || pkg == null) {
        logger.finish('expecting object on top level of package.json', LogLevel.error);
        process.exit(-1);
    }

    if (typeof pkg.name !== 'string' && outputs.umdEntries.length > 0) {
        logger.finish('expecting name to be a string in package.json', LogLevel.error);
        process.exit(-1);
    }

    if (!Array.isArray(pkg.files)) {
        pkg.files = [];
    }

    if (!pkg.files.includes(paths.outputDir)) {
        /** @type {string[]} */ (pkg.files).push(paths.outputDir);
    }

    if (typeof pkg.scripts !== 'object' && pkg.scripts !== null) {
        pkg.scripts = {};
    }

    if (packageJson.pack && !('prepack' in /** @type {Record<string, JsonObject>} */ (pkg.scripts))) {
        /** @type {Record<string, JsonValue>} */ (pkg.scripts).prepack = 'pkgprn';
    }

    if (allowEsm && !allowCjs && typeof pkg.type !== 'string') {
        pkg.type = 'module';
    }

    const exportsFields = new Set([
        'svelte',
        pkg.type === 'module' ? 'require' : 'import',
        pkg.type === 'module' ? 'import' : 'require',
        'default',
    ]);

    if (allowUmd && typeof pkg.umd === 'string') {
        if (outputs.umdEntries.includes(indexId)) {
            pkg.umd = `./${paths.outputDir}/${patternToName(outputs.patterns.umd, indexId)}`;
        }
    }

    if (allowCjs) {
        pkg.main = `./${paths.outputDir}/${patternToName(outputs.patterns.cjs, indexId)}`;
    }

    if (allowEsm && !allowCjs) {
        pkg.main = `./${paths.outputDir}/${patternToName(outputs.patterns.es, indexId)}`;
    }

    if (allowCjs && allowEsm && typeof pkg.module !== 'string') {
        pkg.module = `./${paths.outputDir}/${patternToName(outputs.patterns.es, indexId)}`;
    }

    if (allowUmd && outputs.umdEntries.includes(indexId)) {
        pkg.unpkg = `./${paths.outputDir}/${patternToName(outputs.patterns.umd, indexId)}`;
    }

    if (packageJson.exports) {
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

            const cjsFieldName = pkg.type === 'module' ? 'require' : 'default';
            const esmFieldName = pkg.type === 'module' ? 'default' : 'import';

            if (allowEsm) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[esmFieldName] =
                    `./${paths.outputDir}/${patternToName(outputs.patterns.es, basename)}`;
            }

            if (allowCjs) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[cjsFieldName] =
                    `./${paths.outputDir}/${patternToName(outputs.patterns.cjs, basename)}`;
            }

            /** @type {Record<string, JsonValue>} */ (pkg.exports)[id] = orderFields(
                exportsFields,
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])
            );

            await updateExtensions(basename);
        }
    } else {
        await updateExtensions(indexId);
    }

    pluginLifecycle.processPackageJson(/** @type {PackageJson} */ (pkg), inputs, configuration);

    if (packageJson.executables.mode === 'explicit') {
        executableOutputs = [...packageJson.executables.values];
        if (executableOutputs.length > 0) {
            pkg.bin = /** @type {string} */ (executableOutputs[0]);
        }
    } else if (packageJson.executables.mode === 'infer' && allowCjs && inputs.length > 0) {
        if (typeof pkg.bin === 'string') {
            if (inputs.some(input => pkg.bin === getCommonjsOutputPath(input))) {
                executableOutputs = [pkg.bin];
            }
        } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            executableOutputs = /** @type {string[]} */ (
                Object.values(pkg.bin).filter(
                    value => typeof value === 'string' && inputs.some(input => value === getCommonjsOutputPath(input))
                )
            );
        }
        if (
            typeof pkg.directories === 'object' &&
            pkg.directories != null &&
            'bin' in pkg.directories &&
            typeof pkg.directories.bin === 'string'
        ) {
            if (path.resolve(pkg.directories.bin) === path.resolve(paths.outputDir)) {
                executableOutputs.push(...inputs.map(input => `./${paths.outputDir}/${patternToName(outputs.patterns.cjs, input)}`));
                executableOutputs = Array.from(new Set(executableOutputs));
            }
        }
    }

    return { inputs, inputsExt, executableOutputs };

    /**
     * @param {string} id
     */
    async function updateExtensions(id) {
        const sourceFileWithoutSuffix = `./${paths.sourceDir}/${id}.`;

        for (const suffix of sourceFileSuffixes) {
            const file = sourceFileWithoutSuffix + suffix;
            if (await isExists(file)) {
                inputs.push(file);
                inputsExt.set(id, suffix);
                break;
            }
        }
    }

    /**
     * @param {string} input
     */
    function getCommonjsOutputPath(input) {
        const relativeInput = path.relative(paths.sourceDir, input);
        const entryName = relativeInput.slice(0, -path.extname(relativeInput).length);
        return `./${paths.outputDir}/${patternToName(outputs.patterns.cjs, entryName)}`;
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
