import path from 'path';
import { InternalModuleFormat, OutputChunk } from 'rollup';
import { CliOptions, Priority, Provider } from '../types';

export default async function(provider: Provider, config: CliOptions) {
    if (config.bin != null && config.bin.length > 0) {
        const pluginBinify = await provider.import('@rollup-extras/plugin-binify');

        const format = {
            'cjs': 'cjs' as InternalModuleFormat,
            'mjs': 'es' as InternalModuleFormat
        }[path.extname(config.bin[0] as string)] ?? 'cjs';

        provider.provide(() => pluginBinify({
            filter: (item: OutputChunk) => item.type === 'chunk' && item.isEntry && (config.bin as string[]).some(input => input === `./${config.dir}/${item.fileName}`)
        }), Priority.finalize, { outputPlugin: true, format });
    }
}
