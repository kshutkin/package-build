import { Priority } from '../priorities.js';

/**
 * @typedef {import('rollup').OutputChunk} OutputChunk
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
    if (packageResult.executableOutputs.length > 0) {
        const pluginBinify = await provider.import('@rollup-extras/plugin-binify');

        provider.provide(
            () =>
                pluginBinify({
                    filter: (/** @type {OutputChunk} */ item) =>
                        item.type === 'chunk' &&
                        item.isEntry &&
                        packageResult.executableOutputs.some(input => input === `./${configuration.paths.outputDir}/${item.fileName}`),
                }),
            Priority.finalize,
            { outputPlugin: true, format: 'cjs' }
        );
    }
}
