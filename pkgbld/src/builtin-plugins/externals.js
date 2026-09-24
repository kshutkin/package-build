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
    const { inputs, inputsExt } = packageResult;
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
                    configuration.transforms.includeExternals === false
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
        for (const currentInput of configuration.outputs.umdEntries) {
            const isExternal = curryForConfig(
                (
                    /** @type {string} */ currentInput,
                    /** @type {string} */ id,
                    /** @type {boolean} */ external,
                    /** @type {string} */ importer
                ) =>
                    includeExternals(importer, external, id, configuration) ||
                    isExternalInput(currentInput, inputs, inputsExt, id, configuration)
            )(currentInput);
            provider.provide(() => pluginExternals(isExternal), Priority.externals, {
                format: 'umd',
                inputs: [`./${configuration.paths.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`],
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
 * @param {ReadonlyMap<string, string>} inputsExt
 * @param {string} id
 * @param {BuildConfiguration} configuration
 */
function isExternalInput(currentInput, inputs, inputsExt, id, configuration) {
    const normalizedPath = path.isAbsolute(currentInput)
        ? `./${path.relative(process.cwd(), `${currentInput}.${inputsExt.get(currentInput)}`)}`
        : `./${path.join(configuration.paths.sourceDir, `${currentInput}.${inputsExt.get(currentInput)}`)}`;
    const normalizedId = path.isAbsolute(id) ? `./${path.relative(process.cwd(), id)}` : id;
    return normalizedPath !== normalizedId && inputs.includes(normalizedPath);
}
