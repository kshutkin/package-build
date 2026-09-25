import swc from '@rollup/plugin-swc';

/**
 * @typedef {import('pkgbld').Provider} Provider
 * @typedef {import('pkgbld').BuildConfiguration} BuildConfiguration
 * @typedef {import('pkgbld').PackageProcessingResult} PackageProcessingResult
 */

const TRANSPILE_PRIORITY = 6000;

function createSwcRollupPlugin() {
    return swc({
        swc: {
            jsc: {
                parser: {
                    syntax: 'typescript',
                    tsx: true,
                },
            },
        },
    });
}

export function create() {
    /**
     * @param {{ provider: Provider; configuration: BuildConfiguration; packageResult: PackageProcessingResult }} context
     */
    async function providePlugins({ provider, packageResult }) {
        const inputs = packageResult.entries.values.map(entry => entry.sourcePath);
        const typescriptInputs = packageResult.entries.values
            .filter(entry => entry.extension === 'ts' || entry.extension === 'tsx')
            .map(entry => entry.sourcePath);
        if (typescriptInputs.length > 0) {
            provider.globalImport('@rollup/plugin-swc', 'swc');
            const pluginFactory = /** @type {typeof createSwcRollupPlugin} */ (provider.globalSetup(createSwcRollupPlugin));
            provider.provide(
                () => pluginFactory(),
                TRANSPILE_PRIORITY,
                typescriptInputs.length === inputs.length ? undefined : { inputs: typescriptInputs }
            );
        }
    }

    return {
        providePlugins,
    };
}
