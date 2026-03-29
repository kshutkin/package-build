/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('rollup').Plugin} Plugin
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').PackageJson} PackageJson
 */

/** @typedef {null | string | number | boolean | Json[] | { [name: string]: Json }} Json */

/**
 * @typedef {(
 *   factory: () => Plugin,
 *   priority: number,
 *   options?: {
 *     format?: InternalModuleFormat | InternalModuleFormat[];
 *     inputs?: string[];
 *     outputPlugin?: true;
 *   }
 * ) => void} ProvideFunction
 */

/**
 * @typedef {{
 *   provide: ProvideFunction;
 *   import: (module: string, exportName?: string) => Promise<(...args: unknown[]) => Plugin>;
 *   globalImport: (module: string, exportName?: string | string[]) => void;
 *   globalSetup: (code: Function | string) => void;
 * }} Provider
 */

/**
 * @typedef {{
 *   plugin: () => Plugin;
 *   priority: number;
 *   format?: InternalModuleFormat | InternalModuleFormat[];
 *   inputs?: string[];
 *   outputPlugin?: true;
 * }} PkgbldRollupPlugin
 */

/**
 * @typedef {NonNullable<Extract<ReturnType<typeof import('./get-cli-options.js').getCliOptions>, { kind: 'build' }>>} CliOptions
 */

/** @typedef {Record<string, string | number | string[] | number[] | boolean | undefined>} ParsedOptions */

/**
 * @typedef {{
 *   create(): Promise<Partial<PkgbldPlugin>>;
 * }} PkgbldPluginFactory
 */

/**
 * @typedef {{
 *   options(parsedArgs: ParsedOptions, options: CliOptions): void;
 *   processPackageJson(packageJson: PackageJson, inputs: string[]): void;
 *   processTsConfig(config: JsonObject): void;
 *   providePlugins(provider: Provider, config: ParsedOptions, inputs: string[], inputsExt: Map<string, string>): Promise<void>;
 *   getExtraOutputSettings(format: InternalModuleFormat, inputs: string[]): Partial<OutputOptions>;
 *   buildEnd(): Promise<void>;
 * }} PkgbldPlugin
 */

export {};
