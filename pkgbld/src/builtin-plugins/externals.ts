import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import path from 'path';
import { Priotiry, Provider } from '../types';

export default async function(provide: Provider, config: ReturnType<typeof getCliOptions>, inputs: string[]) {
    if (config.includeExternals) {
        return;
    }
    
    const { default: pluginExternals } = await import('@rollup-extras/plugin-externals');

    const allowGenericUmd = config.umdInputs.length === 1 && inputs.length === 1;

    if (config.formats.length > 0) {
        const format = (allowGenericUmd ? undefined : config.formats.filter(format => format !== 'umd')) as InternalModuleFormat[];
        provide(() => pluginExternals(), Priotiry.externals, { format });
    }

    if (!allowGenericUmd && config.umdInputs.length > 0) {
        for(const currentInput of config.umdInputs) {
            provide(() => pluginExternals({
                external: (id, external) => external || isExternalInput(currentInput, inputs, id, config)
            }), Priotiry.externals, { format: 'umd', inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
        }
    }
}

function isExternalInput(currentInput: string, inputs: string | string[], id: string, config: ReturnType<typeof getCliOptions>) {
    let normalizedPath;
    if (path.isAbsolute(currentInput)) {
        normalizedPath = './' + path.relative(process.cwd(), currentInput);
    } else {
        normalizedPath = './' + path.join(config.sourceDir, currentInput + '.ts');
    }
    if (path.isAbsolute(id)) {
        id = './' + path.relative(process.cwd(), id);
    }
    return normalizedPath !== id && inputs.includes(normalizedPath);
}