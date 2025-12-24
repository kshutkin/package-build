import { Priority } from '../priorities';
import type { OutputChunk } from 'rollup';
import type { CliOptions, Provider } from '../types';

export default async function (provider: Provider, config: CliOptions) {
    if (config.bin != null && config.bin.length > 0) {
        const pluginBinify = await provider.import('@rollup-extras/plugin-binify');

        provider.provide(
            () =>
                pluginBinify({
                    filter: (item: OutputChunk) =>
                        item.type === 'chunk' &&
                        item.isEntry &&
                        (config.bin as string[]).some(input => input === `./${config.dir}/${item.fileName}`),
                }),
            Priority.finalize,
            { outputPlugin: true, format: 'cjs' }
        );
    }
}
