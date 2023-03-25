import path from 'path';
import camelCase from 'lodash/camelCase';
import { OutputOptions } from 'rollup';
import kleur from 'kleur';

export function getHelpers(pkgName: string) {
    function getGlobalName(anInput: string) {
        return camelCase(path.join(pkgName, path.basename(anInput, '.ts') !== 'index' ? path.basename(anInput, '.ts') : ''));
    }

    function getExternalGlobalName(id: string) {
        if (path.isAbsolute(id)) {
            return getGlobalName(path.relative(__dirname, id));
        }
        return camelCase(id);
    }

    return {
        getGlobalName,
        getExternalGlobalName
    };
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

export const areSetsEqual = <T>(a: Set<T>, b: Set<T>) => a.size === b.size ? [...a].every(value => b.has(value)) : false;