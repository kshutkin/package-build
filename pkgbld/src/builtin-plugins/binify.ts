import path from 'path';
import { InternalModuleFormat, OutputChunk } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priotiry, Provider } from '../types';

export default async function(provider: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.bin != null) {
        const pluginBinify = await provider.import('@rollup-extras/plugin-binify');

        const format = {
            'cjs': 'cjs' as InternalModuleFormat,
            'mjs': 'es' as InternalModuleFormat
        }[path.extname(config.bin[0])] ?? 'cjs';

        provider.provide(() => pluginBinify({
            filter: (item: OutputChunk) => item.type === 'chunk' && item.isEntry && (config.bin as string[]).some(input => input === `./${config.dir}/${item.fileName}`)
        }), Priotiry.finalize, { outputPlugin: true, format });
    }
}
