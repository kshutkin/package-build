import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 */
export default async function (provider) {
    const pluginResolve = await provider.import('@rollup/plugin-node-resolve');

    provider.provide(() => pluginResolve(), Priority.resolve);
}
