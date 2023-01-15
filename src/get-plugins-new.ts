import { Plugin, InternalModuleFormat } from 'rollup';
import { Priotiry, Provider } from './types';
import clean from './builtin-plugins/clean';
import commonjs from './builtin-plugins/commonjs';
import externals from './builtin-plugins/externals';
import preprocess from './builtin-plugins/preprocess';
import resolve from './builtin-plugins/resolve';
import terser from './builtin-plugins/terser';

export const plugins = [
    clean,
    commonjs,
    externals,
    preprocess,
    resolve,
    terser
];

export function createProvider(): [Provider, { plugin: Plugin, priority: Priotiry, format?: InternalModuleFormat | InternalModuleFormat[], inputs?: string[], outputPlugin?: true}[]] {
    const plugins: { plugin: Plugin, priority: Priotiry, format?: InternalModuleFormat | InternalModuleFormat[], inputs?: string[], outputPlugin?: true}[] = [];
    return [(plugin: () => Plugin, priority: Priotiry, options?: {
        format?: InternalModuleFormat | InternalModuleFormat[],
        inputs?: string[],
        outputPlugin?: true
    }) => {
        plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
    }, plugins];
}
