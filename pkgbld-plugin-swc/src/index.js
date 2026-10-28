import swc from '@rollup/plugin-swc';

/**
 * @typedef {import('pkgbld').Provider} Provider
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
     * @param {{ provider: Provider }} context
     */
    async function providePlugins({ provider }) {
        provider.globalImport('@rollup/plugin-swc', 'swc');
        const pluginFactory = /** @type {typeof createSwcRollupPlugin} */ (provider.globalSetup(createSwcRollupPlugin));
        provider.provide(() => pluginFactory(), TRANSPILE_PRIORITY);
    }

    return {
        providePlugins,
    };
}
