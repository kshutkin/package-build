import type { Plugin, InternalModuleFormat } from 'rollup';

/**
 * export interface Replacer {
    name: string;
    used: () => void;
}*/

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };

export type PackageJson = {
    name: string,
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies: Record<string, string>;
};

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

export type ProvideFunction = (factory: () => Plugin, priority: Priotiry, options?: {
    format?: InternalModuleFormat | InternalModuleFormat[],
    inputs?: string[],
    outputPlugin?: true
}) => void;

export type Provider = {
    provide: ProvideFunction;
    import: (module: string, exportName?: string) => Promise<((...args: unknown[]) => Plugin)>;
    globalImport: (module: string, exportName?: string | string[]) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    globalSetup: (code: Function | string) => void;
};

export type PkgbldRollupPlugin = {
    plugin: () => Plugin;
    priority: Priotiry;
    format?: InternalModuleFormat | InternalModuleFormat[];
    inputs?: string[];
    outputPlugin?: true;
};