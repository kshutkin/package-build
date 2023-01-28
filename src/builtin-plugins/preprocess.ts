import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.preprocess.length > 0) {
        const { default: pluginPreprocess } = await import('rollup-plugin-preprocess');

        const include = config.preprocess.map(name => `${config.sourceDir}/${name}.ts`);

        for (const format of config.formats as InternalModuleFormat[]) {
            if (format !== 'umd') {
                provide(() => pluginPreprocess({ include, context: { [format]: true } }), Priotiry.preprocess, { format });
            } else {
                for (const currentInput of config.umdInputs) {
                    provide(() => pluginPreprocess({ include, context: { umd: true } }), Priotiry.preprocess, { format, inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
                }
            }
        }
    }
}
