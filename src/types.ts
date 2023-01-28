import { Plugin, InternalModuleFormat } from 'rollup';

/**
 * export interface Replacer {
    name: string;
    used: () => void;
}*/

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };

export const enum Priotiry {
    preprocess = 100,
    cleanup = 100,
    externals = 200,
    resolve = 300,
    commonjs = 400,
    transpile = 600,
    compress = 10000
}

export type Provider = (factory: () => Plugin, priority: Priotiry, options?: {
    format?: InternalModuleFormat | InternalModuleFormat[],
    inputs?: string[],
    outputPlugin?: true
}) => void