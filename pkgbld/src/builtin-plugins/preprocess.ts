import { InternalModuleFormat } from 'rollup';
import { CliOptions, Priority, Provider } from '../types';

export default async function(provider: Provider, config: CliOptions, inputs: string[], inputsExt: Map<string, string>) {
    if (config.preprocess.length > 0) {
        const pluginPreprocess = await provider.import('rollup-plugin-preprocess', 'default');

        const include = config.preprocess.map(name => `${config.sourceDir}/${name}.${inputsExt.get(name)}`);

        for (const format of config.formats as InternalModuleFormat[]) {
            if (format !== 'umd') {
                provider.provide(() => pluginPreprocess({ include, context: { [format]: true } }), Priority.preprocess, { format });
            } else {
                for (const currentInput of config.umdInputs) {
                    provider.provide(() => pluginPreprocess({ include, context: { umd: true } }), Priority.preprocess, { format, inputs: [`./${config.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`] });
                }
            }
        }
    }
}
