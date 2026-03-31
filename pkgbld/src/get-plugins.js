import binify from './builtin-plugins/binify.js';
import clean from './builtin-plugins/clean.js';
import commonjs from './builtin-plugins/commonjs.js';
import externals from './builtin-plugins/externals.js';
import json from './builtin-plugins/json.js';
import preprocess from './builtin-plugins/preprocess.js';
import resolve from './builtin-plugins/resolve.js';
import terser from './builtin-plugins/terser.js';

/**
 * @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin
 * @typedef {import('./types.js').Provider} Provider
 */

export const plugins = [clean, commonjs, externals, preprocess, resolve, terser, binify, json];

const noop = () => undefined;

/**
 * @param {Map<string, Promise<never>>} preimportMap
 * @returns {[Provider, PkgbldRollupPlugin[]]}
 */
export function createProvider(preimportMap) {
    /** @type {PkgbldRollupPlugin[]} */
    const plugins = [];
    return [
        {
            provide: (
                /** @type {PkgbldRollupPlugin['plugin']} */ plugin,
                /** @type {PkgbldRollupPlugin['priority']} */ priority,
                /** @type {Omit<PkgbldRollupPlugin, 'plugin' | 'priority'>=} */ options
            ) => {
                plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
            },
            import: async (/** @type {string} */ name, /** @type {string=} */ exportName) => {
                const result = preimportMap.has(name) ? await preimportMap.get(name) : await import(name);
                return result[exportName ?? 'default'];
            },
            globalImport: noop,
            globalSetup: noop,
        },
        plugins,
    ];
}
