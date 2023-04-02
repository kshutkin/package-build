import { InternalModuleFormat } from 'rollup';
import { getCliOptions } from '../get-cli-options';
import path from 'path';
import { Priotiry, Provider } from '../types';

export default async function(provider: Provider, config: ReturnType<typeof getCliOptions>, inputs: string[]) {
    if (config.includeExternals) {
        return;
    }
    
    const pluginExternals = await provider.import('@rollup-extras/plugin-externals');

    const allowGenericUmd = config.umdInputs.length === 1 && inputs.length === 1;

    if (config.formats.length > 0) {
        const format = (allowGenericUmd ? undefined : config.formats.filter(format => format !== 'umd')) as InternalModuleFormat[];
        provider.provide(() => pluginExternals(), Priotiry.externals, { format });
    }

    if (!allowGenericUmd && config.umdInputs.length > 0) {
        const curry = (await provider.import('lodash/curry.js')) as typeof import('lodash/curry');
        for(const currentInput of config.umdInputs) {
            const isExternal = curry((currentInput: string, id: string, external: boolean) => external || isExternalInput(currentInput, inputs, id, config))(currentInput);
            provider.provide(() => pluginExternals({
                external: isExternal
            }), Priotiry.externals, { format: 'umd', inputs: [`./${config.sourceDir}/${currentInput}.ts`] });
        }
        // for eject config
        provider.globalImport('path', 'path');
        provider.globalSetup(isExternalInput);
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