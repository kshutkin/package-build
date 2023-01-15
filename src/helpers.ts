import path from 'path';
import camelCase from 'lodash/camelCase';
import { getCliOptions } from './get-cli-options';
import { OutputOptions } from 'rollup';
import kleur from 'kleur';

export function getHelpers(name: string) {
    function getGlobalName(anInput: string) {
        return camelCase(path.join(name, path.basename(anInput, '.ts') !== 'index' ? path.basename(anInput, '.ts') : ''));
    }

    function getExternalGlobalName(id: string) {
        if (path.isAbsolute(id)) {
            return getGlobalName(path.relative(__dirname, id));
        }
        return camelCase(id);
    }

    return {
        getGlobalName,
        getExternalGlobalName,
        umdFilter
    };
}

export function umdFilter(config: ReturnType<typeof getCliOptions>, filename: string) {
    const id = path.basename(filename, '.ts');
    return config.umdInputs.includes(id);
}

export function toArray<T>(object: T | T[] | undefined) {
    if (Array.isArray(object)) {
        return object;
    }
    if (object == null) {
        return [];
    }
    return [object];
}

export function isExternalInput(id: string, inputs: string | string[], currentInput: string, config: ReturnType<typeof getCliOptions>) {
    let normalizedPath;
    if (path.isAbsolute(id)) {
        normalizedPath = './' + path.relative(process.cwd(), id);
    } else {
        normalizedPath = './' + path.join(config.sourceDir, id + '.ts');
    }
    return normalizedPath !== currentInput && inputs.includes(normalizedPath);
}

export function formatInput(input: string[] | string): string {
    return (Array.isArray(input) ? input : [input ?? '']).map(item => kleur.magenta(path.basename(item, '.ts'))).join(', ');
}

export function formatOutput(output: OutputOptions | OutputOptions[] | undefined, field: 'dir' | 'format'): string {
    //? can we avoid it
    if (output == null) {
        return '';
    }
    return (Array.isArray(output) ? output : [output ?? '']).map(item => kleur.cyan(item[field] as string)).join(', ');
}

export function getTimeDiff(starting: number) {
    const now = Date.now();
    if (now - starting > 1000) {
        return `${((now - starting) / 1000).toFixed(1)}s`;
    }
    return `${now - starting}ms`;
}

export function getDefaultExport<T extends { default?: unknown }>(importedModule: T) {
    const defaultImport = importedModule.default;
    return defaultImport ? defaultImport : importedModule;
}