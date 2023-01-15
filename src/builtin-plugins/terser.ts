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
            provide(() => pluginTerser(options), Priotiry.compress, { format: filteredFormats as InternalModuleFormat[], outputPlugin: true });
        }
    }
}
