import type { PkgbldRollupPlugin, Provider } from './types';
import type { RollupOptions } from 'rollup';
import fs from 'fs/promises';
import path from 'path';
import { camelCase } from 'lodash';

const enum ObjectPathSource { root, get, call }

interface ObjectPath {
    useCount: number;
    name: string | symbol;
    parent?: ObjectPath;
    source: ObjectPathSource,
    options?: unknown
}

const ops = Symbol();
const unwrap = Symbol();

type Unwrappable<T> = {
    [unwrap]: T;
} & T;

export const unwrapValue = <T>(value: T) => (value != null && (value as Unwrappable<T>)[unwrap]) || value;

const op: ObjectPath[] = [];

function createMock<T extends object>(objectPath: ObjectPath): T {
    op.push(objectPath);
    const target = function(){ /* function used as callable object */ } as never as { [ops]: ObjectPath };
    target[ops] = objectPath;
    return new Proxy(target, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(target: T, p: string | symbol, value: any, receiver: any) {
            const realValue = unwrapValue(value);
            // TODO update objectPath
            if (Reflect.get(target, p, receiver) !== realValue) {
                Reflect.set(target, p, realValue, receiver);
            }
            return true;
        },
        get(target: object, p: string | symbol) {
            if (p === unwrap) return target;
            if (p === ops) return objectPath;
            return createMock({
                useCount: 1,
                name: p,
                parent: objectPath,
                source: ObjectPathSource.get
            });
        },
        defineProperty(...args: [never, string | symbol, PropertyDescriptor]) {
            return Reflect.defineProperty(...args);
        },
        deleteProperty(target: object, p: string | symbol) {
            const result = Reflect.deleteProperty(target, p);
            return result;
        },
        apply(_target: object, _thisArg: any, argumentsList: any[]) {
            return createMock({
                useCount: 1,
                name: '',
                parent: objectPath,
                source: ObjectPathSource.call,
                options: argumentsList
            });
        }
    }) as T;
}

const imports = new Map<string, string>;

const setup = new Set<string>;

export function createEjectProvider() {
    const plugins: PkgbldRollupPlugin[] = [];
    return [{
        provide: (plugin: PkgbldRollupPlugin['plugin'], priority: PkgbldRollupPlugin['priority'], options?: Omit<PkgbldRollupPlugin, 'plugin' | 'priority'>) => {
            plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        import: async (name: string, _exportName?: string) => {
            const mangledName = camelCase(name);
            imports.set(name, mangledName);
            return (o: unknown) => {
                return createMock({
                    name: '',
                    parent: {
                        name: mangledName,
                        source: ObjectPathSource.root,
                        useCount: 1,
                        options: o
                    },
                    source: ObjectPathSource.call,
                    useCount: 1
                });
            };
        }
    }, plugins] as [Provider, PkgbldRollupPlugin[]];
}

export async function ejectConfig(config: RollupOptions[], pkgPath: string) {
    const replacer = (value: object) => {
        if ((value as any)[ops] as ObjectPath) {
            return getCode((value as any)[ops]);
        }
        return value;
    };
    const text = stringify(config, replacer as any);
    console.log(text);
    const importsString = Array.from(imports)
        .map((value) => `import ${value[1]} from '${value[0]}';`)
        .join('\n');
    const setupString = 
        Array.from(setup)
            .join('\n');

    const { minify } = await import('terser');

    const result = await minify(`${importsString}\n${setupString}\nexport default ${text};`, {
        module: true,
        compress: {
            booleans: false,
            arguments: true,
            ecma: 2020,
            keep_classnames: true,
            keep_fnames: true,
            keep_infinity: true,
            module: true,
            passes: 2,
            unsafe: true,
            unsafe_methods: true,
            unsafe_regexp: true
        },
        mangle: false,
        output: {
            beautify: true,
            ecma: 2020
        }
    });
    await fs.writeFile(path.join(path.dirname(pkgPath), 'rollup.config.js'), result.code as string);
    // add packages into package.json
    // write tsconfig.json
}

function getCode(value: ObjectPath): string {
    switch(value.source) {
    case ObjectPathSource.call:
        return value.parent ? ((value.parent.parent ? getCode(value.parent.parent) + '.' : '') + (value.parent.name as string + '()')): '';
    case ObjectPathSource.get:
        return (value.parent ? getCode(value.parent) + '.' : '') + (value.name as string);
    case ObjectPathSource.root:
        return value.name as string;
    }
}

function stringify(o: unknown, replacer: (v: unknown) => unknown): string {
    const original = o;
    o = replacer(o);
    if (original !== o && typeof o === 'string') {
        return o;
    }
    if (o === null) {
        return 'null';
    }
    if (o === undefined) {
        return 'undefined';
    }
    if (typeof o === 'number') {
        return `${o}`;
    }
    if (Array.isArray(o)) {
        return `[${o.map((v) => stringify(v, replacer)).join(',')}]`;
    }
    if (typeof o === 'boolean') {
        return String(o);
    }
    if (typeof o === 'function') {
        return o.toString();
    }
    if (typeof o === 'object') {
        return `{${Object.entries(o).map(([key, v]) => key + ':' + stringify(v, replacer)).join(',')}}`;
    }
    return `"${String(o)}"`;
}