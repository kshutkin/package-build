import type { Plugin, InternalModuleFormat, OutputOptions } from 'rollup';
import type { getCliOptions } from './get-cli-options';
import { Logger } from '@niceties/logger';

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };

export type PackageJson = {
    name: string,
    version: string,
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies: Record<string, string>;
    scripts?: Record<string, string>;
};

export const enum Priority {
    preprocess = 1000,
    // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
    cleanup = 1000,
    externals = 2000,
    resolve = 3000,
    commonjs = 4000,
    transpile = 6000,
    compress = 10000,
    finalize = 20000
}

export type ProvideFunction = (factory: () => Plugin, priority: Priority, options?: {
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
    priority: Priority;
    format?: InternalModuleFormat | InternalModuleFormat[];
    inputs?: string[];
    outputPlugin?: true;
};

export type CliOptions = NonNullable<Extract<ReturnType<typeof getCliOptions>, { kind: 'build' }>>;
export type ParsedOptions = Record<string, string | number | string[] | number[] | boolean | undefined>;

// plugins API

export interface PkgbldPlugin {
    options(parsedArgs: ParsedOptions, options: CliOptions): void;
    processPackageJson(packageJson: PackageJson, inputs: string[], logger: Logger): void;
    processTsConfig(config: Json): void;
    providePlugins(provider: Provider, config: ParsedOptions, inputs: string[]): Promise<void>;
    getExtraOutputSettings(format: InternalModuleFormat, inputs: string[]): Partial<OutputOptions>;
    buildEnd(): Promise<void>;
}