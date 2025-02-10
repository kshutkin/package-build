import type { InternalModuleFormat } from 'rollup';
import path from 'node:path';
import type { CliOptions, Provider } from '../types';
import { Priority } from '../priorities';

export default async function(provider: Provider, config: CliOptions, inputs: string[], inputsExt: Map<string, string>) {
    if (config.includeExternals === true) {
        return;
    }
    
    const pluginExternals = await provider.import('@rollup-extras/plugin-externals');

    const allowGenericUmd = config.umdInputs.length === 1 && inputs.length === 1;

    if (config.formats.length > 0) {
        const format = (allowGenericUmd ? undefined : config.formats.filter(format => format !== 'umd')) as InternalModuleFormat[];
        provider.provide(() => pluginExternals(config.includeExternals === false
            ? {}
            : (id: string, external: boolean, importer: string) => includeExternals(importer, external, id, config)), Priority.externals, { format });
        // for eject config
        provider.globalImport('path', 'path');
        provider.globalSetup(includeExternals);
    }

    if (!allowGenericUmd && config.umdInputs.length > 0) {
        const curry = (await provider.import('lodash/curry.js')) as typeof import('lodash/curry');
        for(const currentInput of config.umdInputs) {
            const isExternal = curry((currentInput: string, id: string, external: boolean, importer: string) => includeExternals(importer, external, id, config) || isExternalInput(currentInput, inputs, inputsExt, id, config))(currentInput);
            provider.provide(() => pluginExternals(isExternal), Priority.externals, { format: 'umd', inputs: [`./${config.sourceDir}/${currentInput}.${inputsExt.get(currentInput)}`] });
        }
        // for eject config
        if (config.formats.length === 0) {
            provider.globalImport('path', 'path');
            provider.globalSetup(includeExternals);
        }
        provider.globalSetup(isExternalInput);
    }
}

function includeExternals(importer: string, external: boolean, id: string, config: CliOptions) {
    if (config.includeExternals === false) return external;
    if (!external) return false;
    const internals = config.includeExternals as string[];
    if (internals.includes(id) || internals.some(internal => id.includes(internal))) {
        return false;
    }
    return true;
}

function isExternalInput(currentInput: string, inputs: string | string[], inputsExt: Map<string, string>, id: string, config: CliOptions) {
    const normalizedPath = path.isAbsolute(currentInput)
        ? `./${path.relative(process.cwd(), `${currentInput}.${inputsExt.get(currentInput)}`)}`
        : `./${path.join(config.sourceDir, `${currentInput}.${inputsExt.get(currentInput)}`)}`;
    const normalizedId = path.isAbsolute(id) ? `./${path.relative(process.cwd(), id)}` : id;
    return normalizedPath !== normalizedId && inputs.includes(normalizedPath);
}