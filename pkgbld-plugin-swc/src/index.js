import swc from '@rollup/plugin-swc';

/**
 * @typedef {import('pkgbld').Provider} Provider
 * @typedef {import('pkgbld').BuildConfiguration} BuildConfiguration
 * @typedef {import('pkgbld').PackageProcessingResult} PackageProcessingResult
 */

const TRANSPILE_PRIORITY = 6000;

export function create() {
    /**
     * @param {{ provider: Provider; configuration: BuildConfiguration; packageResult: PackageProcessingResult }} context
     */
    async function providePlugins({ provider, packageResult }) {
        const inputs = [...packageResult.inputs];
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
