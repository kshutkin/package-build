import path from 'path';
import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.bin != null) {
        const { default: pluginBinify } = await import('@rollup-extras/plugin-binify');

        const format = {
            'cjs': 'cjs' as InternalModuleFormat,
            'mjs': 'es' as InternalModuleFormat
        }[path.extname(config.bin[0])] ?? 'cjs';

        provide(() => pluginBinify({
            filter: (item) => item.type === 'chunk' && item.isEntry && (config.bin as string[]).some(input => input === `./${config.dir}/${item.fileName}`)
        }), Priotiry.finalize, { outputPlugin: true, format });
    }
}
