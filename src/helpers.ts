import path from 'path';
import camelCase from 'lodash/camelCase';
import { getCliOptions } from './get-cli-options';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getHelpers(pkg: any) {
    function getGlobalName(anInput: string) {
        return camelCase(path.join(pkg.name, path.basename(anInput, '.ts') !== 'index' ? path.basename(anInput, '.ts') : ''));
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
    return config.umdTargets.includes(id);
}

export function toArray<T>(object: T) {
    if (Array.isArray(object)) {
        return object;
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

export function formatInput(input: string[] | string | undefined): string | undefined {
    return Array.isArray(input)? input.join(', ') : input;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatOutput(output: any, field: string): string | undefined {
    return Array.isArray(output)? output.map(item => item[field]).join(', ') : output[field];
}

export function getTimeDiff(starting: number) {
    const now = Date.now();
    if (now - starting > 1000) {
        return `${((now - starting) / 1000).toFixed(1)}s`;
    }
    return `${now - starting}ms`;
}
