import type { getCliOptions } from './get-cli-options';
import { createProvider, plugins as pluginFactories } from './get-plugins-new';
import refiner from '@slimlib/refine-partition';
import { areSetsEqual, toArray } from './helpers';
import { InternalModuleFormat, OutputOptions } from 'rollup';
import type { getHelpers } from './helpers';


const fileNamePatterns = {
    'es': '[name].mjs',
    'cjs': '[name].cjs',
    'umd': '[name].umd.js',
} as {[key in InternalModuleFormat]: string};

export async function getRollupConfigs(inputs: string[], config: ReturnType<typeof getCliOptions>, helpers: ReturnType<typeof getHelpers>) {
    const [provide, plugins] = createProvider();
    for (const factory of pluginFactories) {
        await factory(provide, config, inputs);
    }

    const expandInputs = new Set<string>;

    for (const plugin of plugins) {
        if (plugin.format && plugin.inputs?.length && !plugin.outputPlugin) {
            for (const format of toArray(plugin.format)) {
                expandInputs.add(format);
            }
        }
    }

    const refineNext = refiner<string>();

    refineNext(doExpandInputs(toArray(config.formats) as InternalModuleFormat[]));

    for (const plugin of plugins) {
        if (plugin.format && !plugin.outputPlugin) {
            const formats = toArray(plugin.format);
            if (!plugin.inputs || plugin.inputs.length === 0) {
                refineNext(doExpandInputs(formats));
            } else {
                if (inputs.length === 1) {
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
    }

    const refined = refineNext();
    const partitions: {formats: InternalModuleFormat[], inputs: string[]}[] = [];
    
    for (const partition of refined) {
        const result: {format: InternalModuleFormat, input?: string}[] = [];
        for (const format of partition) {
            if (format.includes('.')) {
                const [,realFormat, input] = format.split(/(.*?)\.(.*)/gm);
                result.push({ format: realFormat as InternalModuleFormat, input });
            } else {
                result.push({ format } as { format: InternalModuleFormat });
            }
        }
        const mapFormatInputs = new Map<InternalModuleFormat, Set<string>>;
        const formatsWithoutInputs = new Set<InternalModuleFormat>;
        for (const {format, input} of result) {
            if (input) {
                if (mapFormatInputs.has(format)) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    mapFormatInputs.get(format)!.add(input);
                } else {
                    mapFormatInputs.set(format, new Set([input]));
                }
            } else {
                formatsWithoutInputs.add(format);
            }
        }
        for (const format of formatsWithoutInputs) {
            if (mapFormatInputs.has(format)) {
                throw new Error(`${format} is both used with inputs and without in plugins configuration and was not expanded / handled correctly. Please file an issue for pkgbld.`);
            }
            mapFormatInputs.set(format, new Set(inputs));
        }
        let prevInputs: Set<string> | undefined;
        for (const inputs of mapFormatInputs.values()) {
            if (prevInputs) {
                if (!areSetsEqual(inputs, prevInputs)) {
                    throw new Error(`unbalanced inputs for partition: ${JSON.stringify(partition)}`);
                }
            }
            prevInputs = inputs;
        }
        partitions.push({formats: [...mapFormatInputs.keys()], inputs: [...prevInputs as Set<string>]});
    }

    return partitions.map(({formats, inputs}) => {
        return {
            input: inputs,
    
            output: formats.map(format => ({
                format,
                dir: config.dir,
                entryFileNames: fileNamePatterns[format],
                plugins: getPlugins([format], inputs, true),
                sourcemap: config.sourcemapFormats.includes(format),
                ...getExtraOutputSettings(format, inputs)
            })),
    
            plugins: getPlugins(formats, inputs, false)
        };
    });

    function getExtraOutputSettings(format: InternalModuleFormat, inputs: string[]): Partial<OutputOptions> {
        switch (format) {
        case 'cjs':
        case 'es':
            return { chunkFileNames: fileNamePatterns[format] };
        case 'umd':
            if (inputs.length <= 0) {
                break;
            }
            if (inputs.length > 1) {
                throw new Error(`Cannot produce global name for mutliple umd inputs in one output: ${inputs}`);
            }
            return {
                name: helpers.getGlobalName(inputs[0]),
                globals: helpers.getExternalGlobalName,
            };
        }
        return {};
    }

    function getPlugins(formats: InternalModuleFormat[], inputs: string[], outputPlugin: boolean) {
        const filteredPlugins = [];
        for (const plugin of plugins) {
            if ((!!plugin.outputPlugin) === outputPlugin) {
                if ((!plugin.format || toArray(plugin.format).some(format => formats.includes(format)))
                    && (!plugin.inputs || plugin.inputs.every(input => inputs.includes(input)))) {
                    filteredPlugins.push({
                        instance: plugin.plugin(),
                        priority: plugin.priority
                    });
                }
            }
        }
        filteredPlugins.sort((a, b) => a.priority - b.priority);
        return filteredPlugins.map(plugin => plugin.instance);
    }

    function doExpandInputs(formats: InternalModuleFormat[]) {
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
                        expanded.push(`${format}../${config.sourceDir}/${input}.ts`);
                    }
                }
            } else {
                expanded.push(format);
            }
        }
        return expanded;
    }
}
