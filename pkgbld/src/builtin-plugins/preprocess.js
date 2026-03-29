import { Priority } from '../priorities.js';

/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('../types.js').CliOptions} CliOptions
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {CliOptions} config
 * @param {string[]} _inputs
 * @param {Map<string, string>} inputsExt
 */
export default async function (provider, config, _inputs, inputsExt) {
    if (config.preprocess.length > 0) {
        const pluginPreprocess = /** @type {typeof import('rollup-plugin-preprocess')} */ (
            await provider.import('rollup-plugin-preprocess')
        );

        const include = config.preprocess.map(name => `${config.sourceDir}/${name}.${inputsExt.get(name)}`);

        for (const format of /** @type {InternalModuleFormat[]} */ (config.formats)) {
            if (format !== 'umd') {
                provider.provide(() => pluginPreprocess.default({ include, context: { [format]: true } }), Priority.preprocess, { format });
            } else {
                for (const currentInput of config.umdInputs) {
                    provider.provide(() => pluginPreprocess.default({ include, context: { umd: true } }), Priority.preprocess, {
                        format,
                        inputs: [`./${config.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`],
                    });
                }
            }
        }
    }
}
