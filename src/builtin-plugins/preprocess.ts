import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>) {
    if (config.preprocess.length > 0) {
        const { default: pluginPreprocess } = await import('rollup-plugin-preprocess');

        const include = config.preprocess.map(name => `${config.sourceDir}/${name}.ts`);

        for (const format of config.formats as InternalModuleFormat[]) {
            provide(() => pluginPreprocess({ include, context: { [format]: true } }), Priotiry.compress, { format });
        }
    }
}
