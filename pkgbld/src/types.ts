import type { Plugin, InternalModuleFormat, OutputOptions } from 'rollup';
import type { getCliOptions } from './get-cli-options';
import { Logger } from '@niceties/logger';
import { PackageJson } from './options-types';

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };

export type ProvideFunction = (factory: () => Plugin, priority: number, options?: {
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
    priority: number;
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
    providePlugins(provider: Provider, config: ParsedOptions, inputs: string[], inputsExt: Map<string, string>): Promise<void>;
    getExtraOutputSettings(format: InternalModuleFormat, inputs: string[]): Partial<OutputOptions>;
    buildEnd(): Promise<void>;
}