import { Plugin, InternalModuleFormat } from 'rollup';

/**
 * export interface Replacer {
    name: string;
    used: () => void;
}*/

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };

export const enum Priotiry {
    preprocess = 1000,
    cleanup = 1000,
    externals = 2000,
    resolve = 3000,
    commonjs = 4000,
    transpile = 6000,
    compress = 10000,
    finalize = 20000
}

export type Provider = (factory: () => Plugin, priority: Priotiry, options?: {
    format?: InternalModuleFormat | InternalModuleFormat[],
    inputs?: string[],
    outputPlugin?: true
}) => void