import path from 'node:path';

import { Priority } from '../priorities.js';

/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('../types.js').CliOptions} CliOptions
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {CliOptions} config
 * @param {string[]} inputs
 * @param {Map<string, string>} inputsExt
 */
export default async function (provider, config, inputs, inputsExt) {
    if (config.includeExternals === true) {
        return;
    }

    const pluginExternals = await provider.import('@rollup-extras/plugin-externals');

    const allowGenericUmd = config.umdInputs.length === 1 && inputs.length === 1;

    if (config.formats.length > 0) {
        const format = /** @type {InternalModuleFormat[]} */ (
            allowGenericUmd ? undefined : config.formats.filter(format => format !== 'umd')
        );
        provider.provide(
            () =>
                pluginExternals(
                    config.includeExternals === false
                        ? {}
                        : (/** @type {string} */ id, /** @type {boolean} */ external, /** @type {string} */ importer) =>
                              includeExternals(importer, external, id, config)
                ),
            Priority.externals,
            { format }
        );
        provider.globalImport('path', 'path');
        provider.globalSetup(includeExternals);
    }

    if (!allowGenericUmd && config.umdInputs.length > 0) {
        const curry = /** @type {typeof import('lodash/curry')} */ (await provider.import('lodash/curry.js'));
        for (const currentInput of config.umdInputs) {
            const isExternal = curry(
                (
                    /** @type {string} */ currentInput,
                    /** @type {string} */ id,
                    /** @type {boolean} */ external,
                    /** @type {string} */ importer
                ) => includeExternals(importer, external, id, config) || isExternalInput(currentInput, inputs, inputsExt, id, config)
            )(currentInput);
            provider.provide(() => pluginExternals(isExternal), Priority.externals, {
                format: 'umd',
                inputs: [`./${config.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`],
            });
        }
        if (config.formats.length === 0) {
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
 * @param {CliOptions} config
 */
function includeExternals(_importer, external, id, config) {
    if (config.includeExternals === false) return external;
    if (!external) return false;
    const internals = /** @type {string[]} */ (config.includeExternals);
    if (internals.includes(id) || internals.some(internal => id.includes(internal))) {
        return false;
    }
    return true;
}

/**
 * @param {string} currentInput
 * @param {string | string[]} inputs
 * @param {Map<string, string>} inputsExt
 * @param {string} id
 * @param {CliOptions} config
 */
function isExternalInput(currentInput, inputs, inputsExt, id, config) {
    const normalizedPath = path.isAbsolute(currentInput)
        ? `./${path.relative(process.cwd(), `${currentInput}.${inputsExt.get(currentInput)}`)}`
        : `./${path.join(config.sourceDir, `${currentInput}.${inputsExt.get(currentInput)}`)}`;
    const normalizedId = path.isAbsolute(id) ? `./${path.relative(process.cwd(), id)}` : id;
    return normalizedPath !== normalizedId && inputs.includes(normalizedPath);
}
