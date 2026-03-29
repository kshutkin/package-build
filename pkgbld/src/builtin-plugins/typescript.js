import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').CliOptions} CliOptions
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {CliOptions} _config
 * @param {string[]} inputs
 */
export default async function (provider, _config, inputs) {
    const typescriptInputs = inputs.filter(input => input.endsWith('.ts') || input.endsWith('.tsx'));
    if (typescriptInputs.length > 0) {
        const pluginTypescript = await provider.import('rollup-plugin-typescript2');

        provider.provide(
            () => pluginTypescript(),
            Priority.transpile,
            typescriptInputs.length === inputs.length ? undefined : { inputs: typescriptInputs }
        );
    }
}
