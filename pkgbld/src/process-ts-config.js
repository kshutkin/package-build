import path from 'node:path';

import cloneDeep from 'lodash/cloneDeep.js';
import isEqual from 'lodash/isEqual.js';

import { getJson } from './get-json.js';
import { writeJson } from './write-json.js';

/**
 * @typedef {import('@niceties/logger').Logger} Logger
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 */

/**
 * @param {string} sourceDir
 * @returns {Record<string, unknown>}
 */
function createDefaultTsConfig(sourceDir) {
    return {
        include: [sourceDir, 'types'],
        compilerOptions: {
            lib: ['dom', 'esnext'],
            target: 'esnext',
            module: 'esnext',
            esModuleInterop: true,
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            sourceMap: true,
            noUncheckedIndexedAccess: true,
            declaration: true,
            moduleResolution: 'bundler',
            rootDir: `./${sourceDir}`,
        },
    };
}

/**
 * @param {CliOptions} options
 * @param {Logger} mainLogger
 * @param {Partial<PkgbldPlugin>[]} plugins
 * @returns {Promise<JsonObject | undefined>}
 */
export async function checkTsConfig(options, mainLogger, plugins) {
    if (!options.tsConfig) {
        return;
    }
    /** @type {JsonObject | undefined} */
    let config,
        needWrite = false;
    try {
        [, config] = await getJson('tsconfig.json');
    } catch {
        /*ignore*/
    }
    try {
        [, config] = await getJson('jsconfig.json');
        if (config && typeof config === 'object' && !Array.isArray(config)) {
            config.allowJs = true;
        }
    } catch {
        /*ignore*/
    }
    if (!config) {
        config = /** @type {JsonObject} */ (createDefaultTsConfig(options.sourceDir || 'src'));
        needWrite = true;
    }
    const originalConfig = cloneDeep(config);
    for (const plugin of plugins) {
        plugin.processTsConfig?.(config);
    }
    if (!isEqual(originalConfig, config)) {
        needWrite = true;
    }
    if (needWrite) {
        mainLogger('no tsconfig.json or jsconfig.json and --no-ts-config not specified, writing tsconfig...');
        await writeJson(path.resolve('tsconfig.json'), config);
        mainLogger('done');
    }
    return config;
}
