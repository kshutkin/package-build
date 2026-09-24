/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('rollup').Plugin} Plugin
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').PackageJson} PackageJson
 */

/** @typedef {null | string | number | boolean | JsonArray | JsonRecord} Json */
/** @typedef {Json[]} JsonArray */
/** @typedef {{ [name: string]: Json }} JsonRecord */

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
 *   globalSetup: (code: ((...args: any[]) => any) | string) => ((...args: any[]) => any) | undefined;
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

/** @typedef {'infer' | 'disabled' | 'explicit'} ExecutableMode */
/** @typedef {'es' | 'cjs' | 'umd'} BuildFormat */
/** @typedef {'ts' | 'tsx' | 'js' | 'jsx' | 'cjs' | 'mjs'} BuildEntryExtension */

/**
 * @typedef {{
 *   paths: { sourceDir: string; outputDir: string };
 *   outputs: {
 *     formats: BuildFormat[];
 *     patterns: { es: string; cjs: string; umd: string };
 *     umdEntries: string[];
 *     sourcemaps: BuildFormat[];
 *   };
 *   transforms: {
 *     compress: BuildFormat[];
 *     preprocess: string[];
 *     includeExternals: boolean | string[];
 *     removeLegalComments: boolean;
 *   };
 *   packageJson: {
 *     update: boolean;
 *     format: boolean;
 *     exports: boolean;
 *     pack: boolean;
 *     executables: { mode: ExecutableMode; values: string[] };
 *   };
 *   typescript: { updateConfig: boolean };
 *   execution: { clean: boolean; bundle: boolean; eject: boolean };
 * }} BuildConfigurationDraft
 */

/**
 * @typedef {Readonly<{
 *   paths: Readonly<{ sourceDir: string; outputDir: string }>;
 *   outputs: Readonly<{
 *     formats: readonly BuildFormat[];
 *     patterns: Readonly<{ es: string; cjs: string; umd: string }>;
 *     umdEntries: readonly string[];
 *     sourcemaps: readonly BuildFormat[];
 *   }>;
 *   transforms: Readonly<{
 *     compress: readonly BuildFormat[];
 *     preprocess: readonly string[];
 *     includeExternals: boolean | readonly string[];
 *     removeLegalComments: boolean;
 *   }>;
 *   packageJson: Readonly<{
 *     update: boolean;
 *     format: boolean;
 *     exports: boolean;
 *     pack: boolean;
 *     executables: Readonly<{ mode: ExecutableMode; values: readonly string[] }>;
 *   }>;
 *   typescript: Readonly<{ updateConfig: boolean }>;
 *   execution: Readonly<{ clean: boolean; bundle: boolean; eject: boolean }>;
 * }>} BuildConfiguration
 */

/** @typedef {Record<string, string | number | string[] | number[] | boolean | undefined>} ParsedOptions */

/**
 * @typedef {Readonly<{
 *   defaults: BuildConfiguration;
 *   package: Readonly<PackageJson>;
 *   cli: Readonly<{
 *     values: Readonly<ParsedOptions>;
 *     provided: Readonly<Record<string, boolean>>;
 *   }>;
 * }>} BuildConfigurationSources
 */

/** @typedef {Map<unknown, unknown>} PluginSharedState */

/**
 * @typedef {Readonly<{
 *   name: string;
 *   sourcePath: string;
 *   extension: BuildEntryExtension;
 *   outputPaths: Readonly<Partial<Record<BuildFormat, string>>>;
 * }>} BuildEntry
 */

/** @typedef {{ name: string; sourcePath?: string }} BuildEntryContribution */
/** @typedef {{ add(contribution: BuildEntryContribution): void }} BuildEntryContributions */
/** @typedef {{ code: 'INVALID_BUILD_ENTRY_NAME' | 'DUPLICATE_BUILD_ENTRY' | 'SOURCE_NOT_FOUND' | 'SELECTED_BUILD_ENTRY_NOT_FOUND' | 'OUTPUT_PATH_COLLISION'; path: string; message: string; name?: string }} BuildEntryIssue */

/**
 * @typedef {Readonly<{
 *   values: readonly BuildEntry[];
 *   require(name: string): BuildEntry;
 * }>} BuildEntries
 */

/**
 * @typedef {Readonly<{
 *   entries: BuildEntries;
 *   executableOutputs: readonly string[];
 * }>} PackageProcessingResult
 */

/** @typedef {{ draft: BuildConfigurationDraft; sources: BuildConfigurationSources; shared: PluginSharedState }} PluginConfigureContext */
/** @typedef {{ entries: BuildEntryContributions; configuration: BuildConfiguration; shared: PluginSharedState }} PluginContributeEntriesContext */
/** @typedef {{ packageJson: PackageJson; entries: BuildEntries; configuration: BuildConfiguration; shared: PluginSharedState }} PluginPackageContext */
/** @typedef {{ config: JsonObject; configuration: BuildConfiguration; shared: PluginSharedState }} PluginTsConfigContext */
/** @typedef {{ provider: Provider; configuration: BuildConfiguration; packageResult: PackageProcessingResult; shared: PluginSharedState }} PluginRollupContext */
/** @typedef {{ format: InternalModuleFormat; inputs: string[]; configuration: BuildConfiguration; shared: PluginSharedState }} PluginOutputContext */
/** @typedef {{ configuration: BuildConfiguration; shared: PluginSharedState }} PluginBuildEndContext */

/**
 * @typedef {{
 *   create(): Promise<Partial<PkgbldPlugin>>;
 * }} PkgbldPluginFactory
 */

/**
 * @typedef {{
 *   configure(context: PluginConfigureContext): void;
 *   contributeEntries(context: PluginContributeEntriesContext): void;
 *   processPackageJson(context: PluginPackageContext): void;
 *   processTsConfig(context: PluginTsConfigContext): void;
 *   providePlugins(context: PluginRollupContext): Promise<void>;
 *   getExtraOutputSettings(context: PluginOutputContext): Partial<OutputOptions>;
 *   buildEnd(context: PluginBuildEndContext): Promise<void>;
 * }} PkgbldPlugin
 */

export {};
