/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').BuildConfigurationDraft} BuildConfigurationDraft
 * @typedef {import('./types.js').BuildConfigurationSources} BuildConfigurationSources
 * @typedef {import('./types.js').PackageProcessingResult} PackageProcessingResult
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 * @typedef {import('./types.js').PluginSharedState} PluginSharedState
 * @typedef {import('./types.js').Provider} Provider
 */

/**
 * Owns Build plugin invocation and shared state for one build.
 *
 * The lifecycle preserves phase boundaries, but does not guarantee plugin order
 * within a phase. Asynchronous hooks in the same phase run concurrently.
 * Build plugins must not rely on same-phase shared-state reads and writes.
 *
 * @param {Partial<PkgbldPlugin>[]} plugins
 */
export function createBuildPluginLifecycle(plugins) {
    /** @type {PluginSharedState} */
    const shared = new Map();

    return {
        /**
         * @param {BuildConfigurationDraft} draft
         * @param {BuildConfigurationSources} sources
         */
        configure(draft, sources) {
            for (const plugin of plugins) {
                plugin.configure?.({ draft, sources, shared });
            }
        },

        /**
         * @param {JsonObject} config
         * @param {BuildConfiguration} configuration
         */
        processTsConfig(config, configuration) {
            for (const plugin of plugins) {
                plugin.processTsConfig?.({ config, configuration, shared });
            }
        },

        /**
         * @param {PackageJson} packageJson
         * @param {string[]} inputs
         * @param {BuildConfiguration} configuration
         */
        processPackageJson(packageJson, inputs, configuration) {
            for (const plugin of plugins) {
                plugin.processPackageJson?.({ packageJson, inputs, configuration, shared });
            }
        },

        /**
         * @param {Provider} provider
         * @param {BuildConfiguration} configuration
         * @param {PackageProcessingResult} packageResult
         */
        async provideRollupPlugins(provider, configuration, packageResult) {
            await Promise.all(plugins.map(plugin => plugin.providePlugins?.({ provider, configuration, packageResult, shared })));
        },

        /**
         * @param {Partial<OutputOptions>} settings
         * @param {InternalModuleFormat} format
         * @param {string[]} inputs
         * @param {BuildConfiguration} configuration
         */
        extendOutputSettings(settings, format, inputs, configuration) {
            for (const plugin of plugins) {
                if (plugin.getExtraOutputSettings) {
                    Object.assign(settings, plugin.getExtraOutputSettings({ format, inputs, configuration, shared }));
                }
            }
        },

        /** @param {BuildConfiguration} configuration */
        async buildEnd(configuration) {
            await Promise.all(plugins.map(plugin => plugin.buildEnd?.({ configuration, shared })));
        },
    };
}
