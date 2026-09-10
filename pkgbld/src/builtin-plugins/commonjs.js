import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 */
export default async function (provider) {
    const pluginCommonjs = await provider.import('@rollup/plugin-commonjs');

    provider.provide(() => pluginCommonjs(), Priority.commonjs);
}
