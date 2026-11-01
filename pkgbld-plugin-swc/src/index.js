import swc from '@rollup/plugin-swc';
import { getProjectTsConfig } from 'pkgbld/tsconfig';

/**
 * @typedef {import('pkgbld').Provider} Provider
 */

const TRANSPILE_PRIORITY = 6000;

/** @param {import('@swc/core').JscConfig} jsc */
function createSwcRollupPlugin(jsc) {
    return swc({
        swc: {
            jsc: {
                ...jsc,
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
        const compilerOptions = getProjectTsConfig()?.config.compilerOptions;
        const target = compilerOptions?.target;
        const useDefineForClassFields = compilerOptions?.useDefineForClassFields;
        /** @type {import('@swc/core').JscConfig} */
        const jsc = {};
        if (target !== undefined || useDefineForClassFields !== undefined) {
            jsc.target = /** @type {import('@swc/core').JscTarget} */ (target === 'es6' ? 'es2015' : target);
            // Loose mode forces assignment semantics, even for modern targets.
            jsc.loose = false;
            jsc.transform = { useDefineForClassFields: useDefineForClassFields ?? false };
        }
        provider.globalImport('@rollup/plugin-swc', 'swc');
        const pluginFactory = /** @type {typeof createSwcRollupPlugin} */ (provider.globalSetup(createSwcRollupPlugin));
        provider.provide(() => pluginFactory(jsc), TRANSPILE_PRIORITY);
    }

    return {
        providePlugins,
    };
}
