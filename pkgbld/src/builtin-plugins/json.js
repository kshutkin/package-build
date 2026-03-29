import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 */
export default async function (provider) {
    const pluginJson = await provider.import('@rollup/plugin-json');

    provider.provide(() => pluginJson(), Priority.preprocess);
}
