import swc from '@rollup/plugin-swc';

/**
 * @typedef {import('pkgbld').Provider} Provider
 * @typedef {import('pkgbld').ParsedOptions} ParsedOptions
 */

const TRANSPILE_PRIORITY = 6000;

export function create() {
    /**
     * @param {Provider} provider
     * @param {ParsedOptions} _config
     * @param {string[]} inputs
     * @param {Map<string, string>} _inputsExt
     */
    async function providePlugins(provider, _config, inputs, _inputsExt) {
        const typescriptInputs = inputs.filter(input => input.endsWith('.ts') || input.endsWith('.tsx'));
        if (typescriptInputs.length > 0) {
            provider.provide(
                () =>
                    swc({
                        swc: {
                            jsc: {
                                parser: {
                                    syntax: 'typescript',
                                    tsx: true,
                                },
                            },
                        },
                    }),
                TRANSPILE_PRIORITY,
                typescriptInputs.length === inputs.length ? undefined : { inputs: typescriptInputs }
            );
        }
    }

    return {
        providePlugins,
    };
}
