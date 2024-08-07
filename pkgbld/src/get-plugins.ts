import type { PkgbldRollupPlugin, Provider } from './types';
import clean from './builtin-plugins/clean';
import commonjs from './builtin-plugins/commonjs';
import externals from './builtin-plugins/externals';
import preprocess from './builtin-plugins/preprocess';
import resolve from './builtin-plugins/resolve';
import terser from './builtin-plugins/terser';
import typescript from './builtin-plugins/typescript';
import binify from './builtin-plugins/binify';
import json from './builtin-plugins/json';

export const plugins = [
    clean,
    commonjs,
    externals,
    preprocess,
    resolve,
    terser,
    typescript,
    binify,
    json
];

const noop = () => undefined;

export function createProvider(preimportMap: Map<string, Promise<never>>) {
    const plugins: PkgbldRollupPlugin[] = [];
    return [{
        provide: (plugin: PkgbldRollupPlugin['plugin'], priority: PkgbldRollupPlugin['priority'], options?: Omit<PkgbldRollupPlugin, 'plugin' | 'priority'>) => {
            plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
        },
        import: async (name: string, exportName?: string) => {
            const result = preimportMap.has(name) ? await preimportMap.get(name) : await import(name);
            return result[exportName ?? 'default'];
        },
        globalImport: noop,
        globalSetup: noop
    }, plugins] as [Provider, PkgbldRollupPlugin[]];
}