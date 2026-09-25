import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').Provider} Provider
 * @typedef {import('../types.js').BuildConfiguration} BuildConfiguration
 */

/**
 * @param {Provider} provider
 * @param {BuildConfiguration} configuration
 */
export default async function (provider, configuration) {
    const pluginResolve = await provider.import('@rollup/plugin-node-resolve');

    provider.provide(
        () =>
            configuration.resolution.conditions.length > 0
                ? pluginResolve({ exportConditions: [...configuration.resolution.conditions] })
                : pluginResolve(),
        Priority.resolve
    );
}
