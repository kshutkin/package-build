import { Priority } from '../priorities.js';

/**
 * @typedef {import('rollup').OutputChunk} OutputChunk
 * @typedef {import('../types.js').CliOptions} CliOptions
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {CliOptions} config
 */
export default async function (provider, config) {
    if (config.bin != null && config.bin.length > 0) {
        const pluginBinify = await provider.import('@rollup-extras/plugin-binify');

        provider.provide(
            () =>
                pluginBinify({
                    filter: (/** @type {OutputChunk} */ item) =>
                        item.type === 'chunk' &&
                        item.isEntry &&
                        /** @type {string[]} */ (config.bin).some(input => input === `./${config.dir}/${item.fileName}`),
                }),
            Priority.finalize,
            { outputPlugin: true, format: 'cjs' }
        );
    }
}
