import fs from 'node:fs/promises';
import path from 'node:path';

import { fastIsEqual } from 'fast-is-equal';

import { toFormattedJsonc } from './json.js';
import { toFormattedJson } from './options/index.js';
import { getProjectTsConfig } from './tsconfig.js';

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
    const resolved = getProjectTsConfig();
    const configPath = resolved?.path;
    const current = configPath ? await fs.readFile(configPath, 'utf8') : undefined;
    const config = resolved
        ? /** @type {JsonObject} */ (/** @type {unknown} */ (resolved.config))
        : /** @type {JsonObject} */ (createDefaultTsConfig(configuration.paths.sourceDir || 'src'));
    if (configPath && path.basename(configPath) === 'jsconfig.json') {
        config.compilerOptions ??= {};
        const compilerOptions = /** @type {JsonObject} */ (config.compilerOptions);
        compilerOptions.allowJs ??= true;
    }
    const originalConfig = structuredClone(config);
    pluginLifecycle.processTsConfig(config, configuration);
    if (!configPath || !fastIsEqual(originalConfig, config)) {
        let outputPath = configPath ?? path.resolve('tsconfig.json');
        let authored = current;
        if (configPath && path.dirname(configPath) !== process.cwd()) {
            outputPath = path.resolve(path.basename(configPath));
            authored = toFormattedJson({ extends: path.relative(process.cwd(), configPath).replaceAll('\\', '/') });
        }
        mainLogger(
            configPath
                ? `updating ${outputPath}...`
                : 'no tsconfig.json or jsconfig.json and --no-ts-config not specified, writing tsconfig...'
        );
        const text = toFormattedJsonc(config, authored, configPath ? originalConfig : undefined);
        await fs.writeFile(outputPath, text);
        mainLogger('done');
    }
    return config;
}
