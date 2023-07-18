import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priority, Provider } from '../types';

export default async function(provider: Provider, config: ReturnType<typeof getCliOptions>) {
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

        if (filteredFormats.length > 0) {
            for (const format of filteredFormats as InternalModuleFormat[]) {
                if (format !== 'umd') {
                    provider.provide(() => pluginTerser(options), Priority.compress, { format, outputPlugin: true });
                } else {
                    for (const currentInput of config.umdInputs) {
                        provider.provide(() => pluginTerser(options), Priority.compress, { format, outputPlugin: true, inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
                    }
                }
            }
            
        }
    }
}
