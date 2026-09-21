/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').ParsedOptions} ParsedOptions
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 * @typedef {import('./types.js').Provider} Provider
 */

/**
 * Owns Build plugin invocation and aggregation semantics for one build.
 *
 * @param {Partial<PkgbldPlugin>[]} plugins
 */
export function createBuildPluginLifecycle(plugins) {
    return {
        /**
         * @param {ParsedOptions} flags
         * @param {CliOptions} options
         */
        applyOptions(flags, options) {
            const formatsBeforePlugins = options.formats;
            const formatValuesBeforePlugins = [...formatsBeforePlugins];

            for (const plugin of plugins) {
                plugin.options?.(flags, options);
            }

            if (
                options.formats !== formatsBeforePlugins ||
                options.formats.length !== formatValuesBeforePlugins.length ||
                options.formats.some((format, index) => format !== formatValuesBeforePlugins[index])
            ) {
                options.formatsOverridden = true;
            }
        },

        /** @param {JsonObject} config */
        processTsConfig(config) {
            for (const plugin of plugins) {
                plugin.processTsConfig?.(config);
            }
        },

        /**
         * @param {PackageJson} pkg
         * @param {string[]} inputs
         */
        processPackageJson(pkg, inputs) {
            for (const plugin of plugins) {
                plugin.processPackageJson?.(pkg, inputs);
            }
        },

        /**
         * @param {Provider} provider
         * @param {CliOptions} options
         * @param {string[]} inputs
         * @param {Map<string, string>} inputsExt
         */
        async provideRollupPlugins(provider, options, inputs, inputsExt) {
            await Promise.all(plugins.map(plugin => plugin.providePlugins?.(provider, options, inputs, inputsExt)));
        },

        /**
         * @param {Partial<OutputOptions>} settings
         * @param {InternalModuleFormat} format
         * @param {string[]} inputs
         */
        extendOutputSettings(settings, format, inputs) {
            for (const plugin of plugins) {
                if (plugin.getExtraOutputSettings) {
                    Object.assign(settings, plugin.getExtraOutputSettings(format, inputs));
                }
            }
        },

        async buildEnd() {
            await Promise.all(plugins.map(plugin => plugin.buildEnd?.()));
        },
    };
}
