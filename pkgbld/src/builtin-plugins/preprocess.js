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
    if (configuration.transforms.preprocess.length > 0) {
        const pluginPreprocess = /** @type {typeof import('rollup-plugin-preprocess')} */ (
            await provider.import('rollup-plugin-preprocess')
        );

        const include = configuration.transforms.preprocess.map(name => packageResult.entries.require(name).sourcePath);

        for (const format of /** @type {readonly InternalModuleFormat[]} */ (configuration.outputs.formats)) {
            if (format !== 'umd') {
                provider.provide(() => pluginPreprocess.default({ include, context: { [format]: true } }), Priority.preprocess, { format });
            } else {
                for (const entryName of configuration.outputs.umdEntries) {
                    const currentInput = packageResult.entries.require(entryName).sourcePath;
                    provider.provide(() => pluginPreprocess.default({ include, context: { umd: true } }), Priority.preprocess, {
                        format,
                        inputs: [currentInput],
                    });
                }
            }
        }
    }
}
