import type { InternalModuleFormat } from 'rollup';
import type { CliOptions, Provider } from '../types';
import { Priority } from '../priorities';

export default async function(provider: Provider, config: CliOptions, inputs: string[], inputsExt: Map<string, string>) {
    const filteredFormats = config.compressFormats.filter(format => config.formats.includes(format));

    if (filteredFormats.length > 0) {
        const pluginTerser = await provider.import('@rollup/plugin-terser');

        const options = {
            mangle: {
                properties: {
                    regex: /_$/
                }
            }
        };
        
        if (config.removeLegalComments) {
            (options as unknown as { output: { comments: boolean } }).output = {
                comments: false,
            };
        }

        if (filteredFormats.length > 0) {
            for (const format of filteredFormats as InternalModuleFormat[]) {
                if (format !== 'umd') {
                    provider.provide(() => pluginTerser(options), Priority.compress, { format, outputPlugin: true });
                } else {
                    for (const currentInput of config.umdInputs) {
                        provider.provide(() => pluginTerser(options), Priority.compress, { format, outputPlugin: true, inputs: [`./${config.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`] });
                    }
                }
            }
            
        }
    }
}
