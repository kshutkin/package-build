import path from 'node:path';

import { fastIsEqual } from 'fast-is-equal';

import { getJson } from './get-json.js';
import { writeJson } from './write-json.js';

/**
 * @typedef {import('@niceties/logger').Logger} Logger
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {ReturnType<typeof import('./build-plugin-lifecycle.js').createBuildPluginLifecycle>} BuildPluginLifecycle
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
 * @param {BuildConfiguration} configuration
 * @param {Logger} mainLogger
 * @param {BuildPluginLifecycle} pluginLifecycle
 * @returns {Promise<JsonObject | undefined>}
 */
export async function checkTsConfig(configuration, mainLogger, pluginLifecycle) {
    if (!configuration.typescript.updateConfig) {
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
        config = /** @type {JsonObject} */ (createDefaultTsConfig(configuration.paths.sourceDir || 'src'));
        needWrite = true;
    }
    const originalConfig = structuredClone(config);
    pluginLifecycle.processTsConfig(config, configuration);
    if (!fastIsEqual(originalConfig, config)) {
        needWrite = true;
    }
    if (needWrite) {
        mainLogger('no tsconfig.json or jsconfig.json and --no-ts-config not specified, writing tsconfig...');
        await writeJson(path.resolve('tsconfig.json'), config);
        mainLogger('done');
    }
    return config;
}
