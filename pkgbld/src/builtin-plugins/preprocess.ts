import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priority, Provider } from '../types';

export default async function(provider: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.preprocess.length > 0) {
        const pluginPreprocess = await provider.import('rollup-plugin-preprocess');

        const include = config.preprocess.map(name => `${config.sourceDir}/${name}.ts`);

        for (const format of config.formats as InternalModuleFormat[]) {
            if (format !== 'umd') {
                provider.provide(() => pluginPreprocess({ include, context: { [format]: true } }), Priority.preprocess, { format });
            } else {
                for (const currentInput of config.umdInputs) {
                    provider.provide(() => pluginPreprocess({ include, context: { umd: true } }), Priority.preprocess, { format, inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
                }
            }
        }
    }
}
