import { Priority } from '../priorities.js';

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
    const { inputsExt } = packageResult;
    if (configuration.transforms.preprocess.length > 0) {
        const pluginPreprocess = /** @type {typeof import('rollup-plugin-preprocess')} */ (
            await provider.import('rollup-plugin-preprocess')
        );

        const include = configuration.transforms.preprocess.map(name => `${configuration.paths.sourceDir}/${name}.${inputsExt.get(name)}`);

        for (const format of /** @type {readonly InternalModuleFormat[]} */ (configuration.outputs.formats)) {
            if (format !== 'umd') {
                provider.provide(() => pluginPreprocess.default({ include, context: { [format]: true } }), Priority.preprocess, { format });
            } else {
                for (const currentInput of configuration.outputs.umdEntries) {
                    provider.provide(() => pluginPreprocess.default({ include, context: { umd: true } }), Priority.preprocess, {
                        format,
                        inputs: [`./${configuration.paths.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`],
                    });
                }
            }
        }
    }
}
