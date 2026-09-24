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
    const filteredFormats = configuration.transforms.compress.filter(format => configuration.outputs.formats.includes(format));

    if (filteredFormats.length > 0) {
        const pluginTerser = await provider.import('@rollup/plugin-terser');

        const options = {
            mangle: {
                properties: {
                    regex: /_$/,
                },
            },
        };

        if (configuration.transforms.removeLegalComments) {
            /** @type {any} */ (options).output = {
                comments: false,
            };
        }

        for (const format of /** @type {InternalModuleFormat[]} */ (filteredFormats)) {
            if (format !== 'umd') {
                provider.provide(() => pluginTerser(options), Priority.compress, { format, outputPlugin: true });
            } else {
                for (const entryName of configuration.outputs.umdEntries) {
                    const currentInput = packageResult.entries.require(entryName).sourcePath;
                    provider.provide(() => pluginTerser(options), Priority.compress, {
                        format,
                        outputPlugin: true,
                        inputs: [currentInput],
                    });
                }
            }
        }
    }
}
