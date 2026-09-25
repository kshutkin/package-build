import path from 'node:path';

import { Priority } from '../priorities.js';

/**
 * @param {(...args: any[]) => any} fn
 * @param {any[]} args
 * @returns {any}
 */
export function curry(fn, ...args) {
    return args.length >= fn.length
        ? fn(...args)
        : /** @type {(...nextArgs: any[]) => any} */ ((...nextArgs) => curry(fn, ...args, ...nextArgs));
}

/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('../types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('../types.js').PackageProcessingResult} PackageProcessingResult
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {BuildConfiguration} configuration
 * @param {PackageProcessingResult} packageResult
 */
export default async function (provider, configuration, packageResult) {
    const inputs = packageResult.entries.values.filter(entry => entry.origin !== 'import').map(entry => entry.sourcePath);
    if (configuration.transforms.includeExternals === true) {
        return;
    }

    const pluginExternals = await provider.import('@rollup-extras/plugin-externals');

    const allowGenericUmd = configuration.outputs.umdEntries.length === 1 && inputs.length === 1;

    if (configuration.outputs.formats.length > 0) {
        const format = /** @type {InternalModuleFormat[]} */ (
            allowGenericUmd ? undefined : configuration.outputs.formats.filter(format => format !== 'umd')
        );
        provider.provide(
            () =>
                pluginExternals(
                    configuration.transforms.includeExternals === false && !configuration.resolution.imports
                        ? {}
                        : (/** @type {string} */ id, /** @type {boolean} */ external, /** @type {string} */ importer) =>
                              includeExternals(importer, external, id, configuration)
                ),
            Priority.externals,
            { format }
        );
        provider.globalImport('path', 'path');
        provider.globalSetup(includeExternals);
    }

    if (!allowGenericUmd && configuration.outputs.umdEntries.length > 0) {
        const curryForConfig = /** @type {typeof curry} */ (provider.globalSetup(curry) ?? curry);
        for (const entryName of configuration.outputs.umdEntries) {
            const currentInput = packageResult.entries.require(entryName).sourcePath;
            const isExternal = curryForConfig(
                (
                    /** @type {string} */ currentInput,
                    /** @type {string} */ id,
                    /** @type {boolean} */ external,
                    /** @type {string} */ importer
                ) => includeExternals(importer, external, id, configuration) || isExternalInput(currentInput, inputs, id)
            )(currentInput);
            provider.provide(() => pluginExternals(isExternal), Priority.externals, {
                format: 'umd',
                inputs: [currentInput],
            });
        }
        if (configuration.outputs.formats.length === 0) {
            provider.globalImport('path', 'path');
            provider.globalSetup(includeExternals);
        }
        provider.globalSetup(isExternalInput);
    }
}

/**
 * @param {string} _importer
 * @param {boolean} external
 * @param {string} id
 * @param {BuildConfiguration} configuration
 */
function includeExternals(_importer, external, id, configuration) {
    if (configuration.resolution.imports && id.startsWith('#')) return false;
    if (configuration.transforms.includeExternals === false) return external;
    if (!external) return false;
    const internals = /** @type {readonly string[]} */ (configuration.transforms.includeExternals);
    if (internals.includes(id) || internals.some(internal => id.includes(internal))) {
        return false;
    }
    return true;
}

/**
 * @param {string} currentInput
 * @param {string | readonly string[]} inputs
 * @param {string} id
 */
function isExternalInput(currentInput, inputs, id) {
    const normalizedPath = path.isAbsolute(currentInput) ? `./${path.relative(process.cwd(), currentInput)}` : currentInput;
    const normalizedId = path.isAbsolute(id) ? `./${path.relative(process.cwd(), id)}` : id;
    return normalizedPath !== normalizedId && inputs.includes(normalizedPath);
}
