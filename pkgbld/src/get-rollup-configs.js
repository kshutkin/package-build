import path from 'node:path';

import refiner from '@slimlib/refine-partition';

import { plugins as pluginFactories } from './get-plugins.js';
import { areSetsEqual, toArray } from './helpers.js';

/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').PackageProcessingResult} PackageProcessingResult
 * @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin
 * @typedef {import('./types.js').Provider} Provider
 * @typedef {ReturnType<typeof import('./build-plugin-lifecycle.js').createBuildPluginLifecycle>} BuildPluginLifecycle
 */

/**
 * @param {[Provider, PkgbldRollupPlugin[]]} providerAndPlugins
 * @param {PackageProcessingResult} packageResult
 * @param {BuildConfiguration} configuration
 * @param {ReturnType<import('./helpers.js').getHelpers>} helpers
 * @param {BuildPluginLifecycle} pluginLifecycle
 */
export async function getRollupConfigs([provider, plugins], packageResult, configuration, helpers, pluginLifecycle) {
    const publicEntries = packageResult.entries.values.filter(entry => entry.origin !== 'import');
    const privateEntries = packageResult.entries.values.filter(entry => entry.origin === 'import');
    const inputs = publicEntries.map(entry => entry.sourcePath);
    const publicInputSet = new Set(inputs);
    const entriesBySourcePath = new Map(publicEntries.map(entry => [entry.sourcePath, entry]));
    const factoryInProgress = [];

    const fileNamePatterns = /** @type {{ [key in InternalModuleFormat]: string }} */ ({
        es: configuration.outputs.patterns.es,
        cjs: configuration.outputs.patterns.cjs,
        umd: configuration.outputs.patterns.umd,
    });

    for (const factory of pluginFactories) {
        factoryInProgress.push(factory(provider, configuration, packageResult));
    }

    factoryInProgress.push(pluginLifecycle.provideRollupPlugins(provider, configuration, packageResult));

    await Promise.all(factoryInProgress);

    /** @type {Set<string>} */
    const expandInputs = new Set();

    for (const plugin of plugins) {
        if (plugin.format && plugin.inputs?.some(input => publicInputSet.has(input)) && !plugin.outputPlugin) {
            for (const format of toArray(plugin.format)) {
                expandInputs.add(format);
            }
        }
    }

    const refineNext = refiner();

    refineNext(doExpandInputs(/** @type {InternalModuleFormat[]} */ ([...configuration.outputs.formats])));

    for (const plugin of plugins) {
        if (plugin.format && !plugin.outputPlugin) {
            const publicPluginInputs = plugin.inputs?.filter(input => publicInputSet.has(input));
            if (plugin.inputs && publicPluginInputs?.length === 0) continue;
            const formats = toArray(plugin.format);
            if (!plugin.inputs || plugin.inputs.length === 0) {
                refineNext(doExpandInputs(formats));
            } else if (inputs.length === 1) {
                refineNext(formats);
            } else {
                const expanded = [];
                for (const format of formats) {
                    for (const input of /** @type {string[]} */ (publicPluginInputs)) {
                        expanded.push(`${format}.${input}`);
                    }
                }
                refineNext(expanded);
            }
        }
    }

    const refined = refineNext();
    /** @type {{ formats: InternalModuleFormat[]; inputs: string[] }[]} */
    const partitions = [];

    for (const partition of refined) {
        /** @type {{ format: InternalModuleFormat; input?: string }[]} */
        const result = [];
        for (const format of partition) {
            if (format.includes('.')) {
                const [, realFormat, input] = format.split(/(.*?)\.(.*)/gm);
                result.push({ format: /** @type {InternalModuleFormat} */ (realFormat), input });
            } else {
                result.push({ format: /** @type {InternalModuleFormat} */ (format) });
            }
        }
        /** @type {Map<InternalModuleFormat, Set<string>>} */
        const mapFormatInputs = new Map();
        /** @type {Set<InternalModuleFormat>} */
        const formatsWithoutInputs = new Set();
        for (const { format, input } of result) {
            if (input) {
                if (mapFormatInputs.has(format)) {
                    /** @type {Set<string>} */ (mapFormatInputs.get(format)).add(input);
                } else {
                    mapFormatInputs.set(format, new Set([input]));
                }
            } else {
                formatsWithoutInputs.add(format);
            }
        }
        for (const format of formatsWithoutInputs) {
            if (mapFormatInputs.has(format)) {
                throw new Error(
                    `${format} is both used with inputs and without in plugins configuration and was not expanded / handled correctly. Please file an issue for pkgbld.`
                );
            }
            mapFormatInputs.set(format, new Set(inputs));
        }
        /** @type {Set<string> | undefined} */
        let prevInputs;
        for (const inputs of mapFormatInputs.values()) {
            if (prevInputs) {
                if (!areSetsEqual(inputs, prevInputs)) {
                    throw new Error(`unbalanced inputs for partition: ${JSON.stringify(partition)}`);
                }
            }
            prevInputs = inputs;
        }
        partitions.push({ formats: [...mapFormatInputs.keys()], inputs: [.../** @type {Set<string>} */ (prevInputs)] });
    }

    const publicConfigs = partitions.map(({ formats, inputs }) => {
        return {
            input: Object.fromEntries(
                inputs.map(input => [/** @type {import('./types.js').BuildEntry} */ (entriesBySourcePath.get(input)).name, input])
            ),

            output: formats.map(format => ({
                format,
                dir: configuration.paths.outputDir,
                entryFileNames: fileNamePatterns[format],
                plugins: getPlugins([format], inputs, true),
                sourcemap: configuration.outputs.sourcemaps.some(value => value === format),
                ...getExtraOutputSettings(format, inputs),
            })),

            plugins: getPlugins(formats, inputs, false),
        };
    });

    const privateConfigs = privateEntries.map(entry => {
        const [[format, outputPath]] = Object.entries(entry.outputPaths);
        const input = entry.sourcePath;
        const selectedFormat = /** @type {InternalModuleFormat} */ (format);
        return {
            input,
            output: [
                {
                    format: selectedFormat,
                    dir: configuration.paths.outputDir,
                    entryFileNames: path
                        .relative(path.resolve(configuration.paths.outputDir), path.resolve(outputPath))
                        .replaceAll('\\', '/'),
                    plugins: getPlugins([selectedFormat], [input], true, true),
                    sourcemap: configuration.outputs.sourcemaps.includes(/** @type {import('./types.js').BuildFormat} */ (selectedFormat)),
                    ...getExtraOutputSettings(selectedFormat, [input]),
                },
            ],
            plugins: getPlugins([selectedFormat], [input], false, true),
        };
    });

    return [...publicConfigs, ...privateConfigs];

    /**
     * @param {InternalModuleFormat} format
     * @param {string[]} inputs
     * @returns {Partial<OutputOptions>}
     */
    function getExtraOutputSettings(format, inputs) {
        let result = {};
        switch (format) {
            case 'cjs':
            case 'es':
                result = { chunkFileNames: fileNamePatterns[format] };
                break;
            case 'umd':
                if (inputs.length <= 0) {
                    break;
                }
                if (inputs.length > 1) {
                    throw new Error(`Cannot produce global name for multiple umd inputs in one output: ${inputs}`);
                }
                result = {
                    name: helpers.getGlobalName(inputs.join('_')),
                    globals: helpers.getExternalGlobalName,
                };
                break;
        }
        pluginLifecycle.extendOutputSettings(result, format, inputs, configuration);
        return result;
    }

    /**
     * @param {InternalModuleFormat[]} formats
     * @param {string[]} inputs
     * @param {boolean} outputPlugin
     * @param {boolean} [privateOutput]
     */
    function getPlugins(formats, inputs, outputPlugin, privateOutput = false) {
        const filteredPlugins = [];
        for (const plugin of plugins) {
            if (!!plugin.outputPlugin === outputPlugin) {
                const publicPluginInputs = plugin.inputs?.filter(input => publicInputSet.has(input));
                if (
                    (!plugin.format || toArray(plugin.format).some(format => formats.includes(format))) &&
                    (!plugin.inputs ||
                        plugin.inputs.length === 0 ||
                        (privateOutput
                            ? plugin.inputs.some(input => inputs.includes(input))
                            : publicPluginInputs?.length > 0 && publicPluginInputs.every(input => inputs.includes(input))))
                ) {
                    filteredPlugins.push({
                        instance: plugin.plugin(),
                        priority: plugin.priority,
                    });
                }
            }
        }
        filteredPlugins.sort((a, b) => a.priority - b.priority);
        return filteredPlugins.map(plugin => plugin.instance);
    }

    /**
     * @param {InternalModuleFormat[]} formats
     */
    function doExpandInputs(formats) {
        if (inputs.length === 1) {
            return formats;
        }
        const expanded = [];
        for (const format of formats) {
            if (expandInputs.has(format)) {
                if (format !== 'umd') {
                    for (const input of inputs) {
                        expanded.push(`${format}.${input}`);
                    }
                } else {
                    for (const entryName of configuration.outputs.umdEntries) {
                        expanded.push(`${format}.${packageResult.entries.require(entryName).sourcePath}`);
                    }
                }
            } else {
                expanded.push(format);
            }
        }
        return expanded;
    }
}
