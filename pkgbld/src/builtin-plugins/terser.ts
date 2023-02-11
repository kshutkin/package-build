import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.compressFormats.length > 0) {
        const { default: pluginTerser } = await import('@rollup/plugin-terser');

        const options = {
            mangle: {
                properties: {
                    regex: /_$/
                }
            }
        };

        const filteredFormats = config.compressFormats.filter(format => config.formats.includes(format));

        if (filteredFormats.length > 0) {
            for (const format of filteredFormats as InternalModuleFormat[]) {
                if (format !== 'umd') {
                    provide(() => pluginTerser(options), Priotiry.compress, { format, outputPlugin: true });
                } else {
                    for (const currentInput of config.umdInputs) {
                        provide(() => pluginTerser(options), Priotiry.compress, { format, outputPlugin: true, inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
                    }
                }
            }
            
        }
    }
}
