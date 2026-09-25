import path from 'node:path';

import { createLogger, LogLevel } from '@niceties/logger';

import { resolveBuildEntries } from './build-entries.js';
import { collectPackageImportTargets } from './package-imports.js';

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
/**
 * @param {JsonObject} pkg
 * @param {BuildConfiguration} configuration
 * @param {BuildPluginLifecycle} pluginLifecycle
 * @returns {Promise<PackageProcessingResult>}
 */
export async function processPackage(pkg, configuration, pluginLifecycle) {
    const indexId = 'index';
    const { outputs, packageJson, paths } = configuration;

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

    const importTargets = await collectPackageImportTargets(pkg.imports, configuration, pkg.type);

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

    /** @type {string[]} */
    const entryNames = [];
    if (packageJson.exports) {
        if (typeof pkg.exports === 'object' && pkg.exports != null && !Array.isArray(pkg.exports)) {
            for (const id in pkg.exports) {
                if (id !== './package.json') entryNames.push(exportIdToEntryName(id));
            }
        }
        if (!entryNames.includes(indexId)) entryNames.unshift(indexId);
    } else {
        entryNames.push(indexId);
    }

    const entries = await resolveBuildEntries(entryNames, importTargets, configuration, contributions =>
        pluginLifecycle.contributeEntries(contributions, configuration)
    );
    const indexEntry = entries.require(indexId);

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
            pkg.umd = /** @type {string} */ (indexEntry.outputPaths.umd);
        }
    }

    if (allowCjs) {
        pkg.main = /** @type {string} */ (indexEntry.outputPaths.cjs);
    }

    if (allowEsm && !allowCjs) {
        pkg.main = /** @type {string} */ (indexEntry.outputPaths.es);
    }

    if (allowCjs && allowEsm && typeof pkg.module !== 'string') {
        pkg.module = /** @type {string} */ (indexEntry.outputPaths.es);
    }

    if (allowUmd && outputs.umdEntries.includes(indexId)) {
        pkg.unpkg = /** @type {string} */ (indexEntry.outputPaths.umd);
    }

    if (packageJson.exports) {
        if (typeof pkg.exports !== 'object' || pkg.exports == null || Array.isArray(pkg.exports)) {
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

            const basename = exportIdToEntryName(id);
            const entry = entries.require(basename);

            if (typeof (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id]) !== 'object') {
                /** @type {Record<string, JsonValue>} */ (pkg.exports)[id] = {};
            }

            const cjsFieldName = pkg.type === 'module' ? 'require' : 'default';
            const esmFieldName = pkg.type === 'module' ? 'default' : 'import';

            if (allowEsm) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[esmFieldName] =
                    /** @type {string} */ (entry.outputPaths.es);
            }

            if (allowCjs) {
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])[cjsFieldName] =
                    /** @type {string} */ (entry.outputPaths.cjs);
            }

            /** @type {Record<string, JsonValue>} */ (pkg.exports)[id] = orderFields(
                exportsFields,
                /** @type {Record<string, JsonValue>} */ (/** @type {Record<string, JsonValue>} */ (pkg.exports)[id])
            );
        }
    }

    pluginLifecycle.processPackageJson(/** @type {PackageJson} */ (pkg), entries, configuration);

    if (packageJson.executables.mode === 'explicit') {
        executableOutputs = [...packageJson.executables.values];
        if (executableOutputs.length > 0) {
            pkg.bin = /** @type {string} */ (executableOutputs[0]);
        }
    } else if (packageJson.executables.mode === 'infer' && allowCjs && entries.values.length > 0) {
        if (typeof pkg.bin === 'string') {
            if (entries.values.some(entry => pkg.bin === entry.outputPaths.cjs)) {
                executableOutputs = [pkg.bin];
            }
        } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            executableOutputs = /** @type {string[]} */ (
                Object.values(pkg.bin).filter(
                    value => typeof value === 'string' && entries.values.some(entry => value === entry.outputPaths.cjs)
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
                executableOutputs.push(...entries.values.flatMap(entry => (entry.outputPaths.cjs == null ? [] : [entry.outputPaths.cjs])));
                executableOutputs = Array.from(new Set(executableOutputs));
            }
        }
    }

    return { entries, executableOutputs };
}

/**
 * @param {string} id
 */
function exportIdToEntryName(id) {
    return id === '.' ? 'index' : id.replace(/^\.\//, '').replaceAll('\\', '/');
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
