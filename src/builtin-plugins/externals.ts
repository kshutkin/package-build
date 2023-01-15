import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import { isExternalInput } from '../helpers';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>, inputs: string[]) {
    const { default: pluginExternals } = await import('@rollup-extras/plugin-externals');

    const allowGenericUmd = config.umdInputs.length === 1 && inputs.length === 1;

    if (config.formats.length > 0) {
        const format = (allowGenericUmd ? config.formats : config.formats.filter(format => format !== 'umd')) as InternalModuleFormat[];
        provide(() => pluginExternals(), Priotiry.externals, { format });
    }

    if (!allowGenericUmd && config.umdInputs.length > 0) {
        for(const currentInput of config.umdInputs) {
            provide(() => pluginExternals({
                external: (id, external) => external || isExternalInput(id, inputs, currentInput, config)
            }), Priotiry.externals, { format: 'umd', inputs: [currentInput] });
        }
    }
}