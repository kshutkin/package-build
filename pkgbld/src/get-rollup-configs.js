import refiner from '@slimlib/refine-partition';

import { plugins as pluginFactories } from './get-plugins.js';
import { areSetsEqual, toArray } from './helpers.js';

/**
 * @typedef {import('rollup').InternalModuleFormat} InternalModuleFormat
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').PkgbldPlugin} PkgbldPlugin
 * @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin
 * @typedef {import('./types.js').Provider} Provider
 */

/**
 * @param {[Provider, PkgbldRollupPlugin[]]} providerAndPlugins
 * @param {string[]} inputs
 * @param {Map<string, string>} inputsExt
 * @param {CliOptions} config
 * @param {ReturnType<import('./helpers.js').getHelpers>} helpers
 * @param {Partial<PkgbldPlugin>[]} externalPlugins
 */
export async function getRollupConfigs([provider, plugins], inputs, inputsExt, config, helpers, externalPlugins) {
    const factoryInProgress = [];

    const fileNamePatterns = /** @type {{ [key in InternalModuleFormat]: string }} */ ({
        es: config.esPattern,
        cjs: config.commonjsPattern,
        umd: config.umdPattern,
    });

    for (const factory of pluginFactories) {
        factoryInProgress.push(factory(provider, config, inputs, inputsExt));
    }

    for (const ePlugin of externalPlugins) {
        if (ePlugin.providePlugins) {
            factoryInProgress.push(ePlugin.providePlugins(provider, config, inputs, inputsExt));
        }
    }

    await Promise.all(factoryInProgress);

    /** @type {Set<string>} */
    const expandInputs = new Set();

    for (const plugin of plugins) {
        if (plugin.format && plugin.inputs?.length && !plugin.outputPlugin) {
            for (const format of toArray(plugin.format)) {
                expandInputs.add(format);
            }
        }
    }

    const refineNext = refiner();

    refineNext(doExpandInputs(/** @type {InternalModuleFormat[]} */ (toArray(config.formats))));

    for (const plugin of plugins) {
        if (plugin.format && !plugin.outputPlugin) {
            const formats = toArray(plugin.format);
            if (!plugin.inputs || plugin.inputs.length === 0) {
                refineNext(doExpandInputs(formats));
            } else if (inputs.length === 1) {
                refineNext(formats);
            } else {
                const expanded = [];
                for (const format of formats) {
                    for (const input of plugin.inputs) {
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

    return partitions.map(({ formats, inputs }) => {
        return {
            input: inputs,

            output: formats.map(format => ({
                format,
                dir: config.dir,
                entryFileNames: fileNamePatterns[format],
                plugins: getPlugins([format], inputs, true),
                sourcemap: config.sourcemapFormats.includes(format),
                ...getExtraOutputSettings(format, inputs),
            })),

            plugins: getPlugins(formats, inputs, false),
        };
    });

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
        for (const ePlugin of externalPlugins) {
            if (ePlugin.getExtraOutputSettings) {
                Object.assign(result, ePlugin.getExtraOutputSettings(format, inputs));
            }
        }
        return result;
    }

    /**
     * @param {InternalModuleFormat[]} formats
     * @param {string[]} inputs
     * @param {boolean} outputPlugin
     */
    function getPlugins(formats, inputs, outputPlugin) {
        const filteredPlugins = [];
        for (const plugin of plugins) {
            if (!!plugin.outputPlugin === outputPlugin) {
                if (
                    (!plugin.format || toArray(plugin.format).some(format => formats.includes(format))) &&
                    (!plugin.inputs || plugin.inputs.every(input => inputs.includes(input)))
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
                    for (const input of config.umdInputs) {
                        expanded.push(`${format}../${config.sourceDir}/${input}.${inputsExt.get(input)}`);
                    }
                }
            } else {
                expanded.push(format);
            }
        }
        return expanded;
    }
}
