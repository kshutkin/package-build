import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').CliOptions} CliOptions
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {CliOptions} config
 */
export default async function (provider, config) {
    if (!config.clean) {
        return;
    }

    const pluginClean = await provider.import('@rollup-extras/plugin-clean');

    const pluginInstance = pluginClean();

    provider.provide(pluginFactory, Priority.cleanup, { outputPlugin: true });

    let firstPluginInstance = true;

    function pluginFactory() {
        const result = firstPluginInstance ? pluginInstance : pluginInstance.api.addInstance();
        firstPluginInstance = false;
        return result;
    }
}
