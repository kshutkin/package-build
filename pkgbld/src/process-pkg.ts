import path from 'node:path';
import { createLogger, LogLevel } from '@niceties/logger';
import type { CliOptions, PkgbldPlugin } from './types';
import type { PackageJson, JsonObject, JsonValue } from 'type-fest';
import { isExists } from './helpers';

const emptySet = new Set as Set<string>;
const sourceFileSuffixes = ['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs'] as const; // svelte, vue, etc. are not supported yet

export async function processPackage(pkg: JsonObject, config: CliOptions, plugins: Partial<PkgbldPlugin>[], tsConfig?: JsonObject): Promise<[string[], Map<string, typeof sourceFileSuffixes[number]>]> {
    const typingsFilePattern = '[name].d.ts';
    
    const indexId = 'index';
    
    const typesVersionsLastFields = new Set(['*']);

    // check if declarations enabled
    const isDeclarations = typeof tsConfig === 'object'
        && tsConfig != null && 'compilerOptions' in tsConfig
        && typeof tsConfig.compilerOptions === 'object' && tsConfig.compilerOptions !== null
        && 'declaration' in tsConfig.compilerOptions && tsConfig.compilerOptions.declaration === true;

    const inputs = [] as string[];
    const inputsExt = new Map<string, typeof sourceFileSuffixes[number]>;
    const logger = createLogger();
    const allowEsm = (config.formatsOverridden && config.formats.includes('es') || !config.formatsOverridden);
    const allowCjs = (config.formatsOverridden && config.formats.includes('cjs') || !config.formatsOverridden);
    const allowUmd = (config.formatsOverridden && config.formats.includes('umd') || !config.formatsOverridden || config.umdInputs);

    if (typeof pkg !== 'object' || Array.isArray(pkg) || pkg == null) {
        logger.finish('expecting object on top level of package.json', LogLevel.error);
        process.exit(-1);
    }

    if (typeof pkg.name !== 'string' && config.umdInputs.length > 0) {
        logger.finish('expecting name to be a string in package.json', LogLevel.error);
        process.exit(-1);
    }
    
    if (!Array.isArray(pkg.files)) {
        pkg.files = [];
    }
    
    if (!pkg.files.includes(config.dir)) {
        (pkg.files as string[]).push(config.dir);
    }

    if (typeof pkg.scripts !== 'object' && pkg.scripts !== null) {
        pkg.scripts = {};
    }

    if (!config.noPack && !('prepack' in (pkg.scripts as Record<string, JsonObject>))) {
        const binary = typeof (pkg.scripts as Record<string, string>).build === 'string' && (pkg.scripts as Record<string, string>).build?.startsWith('pkgbld-internal')  ? 'pkgbld-internal' : 'pkgbld';
        (pkg.scripts as Record<string, JsonValue>).prepack = `${binary} prune`;
    }

    if (allowEsm && !allowCjs && typeof pkg.type !== 'string') {
        pkg.type = 'module';
    }

    const exportsFields = new Set([
        'types',
        'svelte',
        pkg.type === 'module' ? 'require' : 'import',
        pkg.type === 'module' ? 'import' : 'require',                
        'default'
    ]);

    if (typeof pkg.typings === 'string') {
        (pkg as Record<string, unknown>).typings = undefined;
    }

    if (isDeclarations) {
        pkg.types = `./${config.dir}/${patternToName(typingsFilePattern, 'index')}`;
    }
    
    if (allowUmd && typeof pkg.umd === 'string') {
        pkg.umd = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
        if (!config.umdInputs.includes(indexId)) {
            config.umdInputs.push(indexId);
        }
    }

    if (allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.commonjsPattern, indexId)}`;
    }

    if (allowEsm && !allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }
    
    if (allowCjs && allowEsm && typeof pkg.module !== 'string') {
        pkg.module = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }
    
    if (allowUmd && config.umdInputs.includes(indexId)) {
        pkg.unpkg = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
    }

    if (isDeclarations) {
        if (typeof pkg.typesVersions !== 'object' && pkg.typesVersions !== null) {
            pkg.typesVersions = {};
        }
        
        if (typeof (pkg.typesVersions as Record<string, JsonValue>)['*'] !== 'object' && (pkg.typesVersions as Record<string, JsonValue>)['*'] !== null) {
            (pkg.typesVersions as Record<string, JsonValue>)['*'] = {};
        }
    }

    if (!config.noExports) {
        if (typeof pkg.exports !== 'object' && pkg.exports !== null) {
            pkg.exports = {};
        }

        if ((pkg.exports as Record<string, JsonValue>)['.'] == null) {
            (pkg.exports as Record<string, JsonValue>)['.'] = {};
        }

        (pkg.exports as Record<string, JsonValue>)['./package.json'] = './package.json';

        if (allowCjs && pkg.main !== ((pkg.exports as Record<string, JsonValue>)['.'] as Record<string, JsonValue>).require) {
            ((pkg.exports as Record<string, JsonValue>)['.'] as Record<string, JsonValue>).require = pkg.main as JsonValue;
        }

        if (pkg.module !== ((pkg.exports as Record<string, JsonValue>)['.'] as Record<string, JsonValue>)?.default) {
            ((pkg.exports as Record<string, JsonValue>)['.'] as Record<string, JsonValue>).default = pkg.module as JsonValue;
        }

        for (const id in pkg.exports as object) {
            if (id === './package.json') continue;

            const basename = id === '.' ? indexId : path.join(path.dirname(id), path.basename(id));

            if (typeof (pkg.exports as Record<string, JsonValue>)[id] !== 'object') {
                (pkg.exports as Record<string, JsonValue>)[id] = {};
            }

            if (isDeclarations) {
                ((pkg.typesVersions as Record<string, JsonValue>)['*'] as Record<string, JsonValue>)[id] = [`${config.dir}/${patternToName(typingsFilePattern, basename)}`];

                ((pkg.exports as Record<string, JsonValue>)[id] as Record<string, JsonValue>).types = `./${config.dir}/${patternToName(typingsFilePattern, basename)}`;
            }

            const cjsFieldName = pkg.type === 'module' ? 'require' : 'default';
            const esmFieldName = pkg.type === 'module' ? 'default' : 'import';

            if (allowEsm) {
                ((pkg.exports as Record<string, JsonValue>)[id] as Record<string, JsonValue>)[esmFieldName] = `./${config.dir}/${patternToName(config.esPattern, basename)}`;
            }

            if (allowCjs) {
                ((pkg.exports as Record<string, JsonValue>)[id] as Record<string, JsonValue>)[cjsFieldName] = `./${config.dir}/${patternToName(config.commonjsPattern, basename)}`;
            }

            ((pkg.exports as Record<string, JsonValue>)[id] as Record<string, JsonValue>) = orderFields(exportsFields,(pkg.exports as Record<string, JsonValue>)[id] as Record<string, JsonValue>);

        
            if (basename !== indexId) {
                if (!pkg.files.includes(basename)) {
                    (pkg.files as string[]).push(basename);
                }
            }
        
            await updateExtensions(basename);
        }
    } else {
        await updateExtensions(indexId);
    }

    if (isDeclarations) {
        ((pkg.typesVersions as Record<string, JsonValue>)['*'] as Record<string, JsonValue>)['*'] = [
            `${config.dir}/${patternToName(typingsFilePattern, indexId)}`,
            `${config.dir}/*`
        ];

        ((pkg.typesVersions as Record<string, JsonValue>)['*'] as Record<string, JsonValue>) = orderFields(emptySet, (pkg.typesVersions as Record<string, JsonValue>)['*'] as Record<string, JsonValue>, typesVersionsLastFields);
    }

    if (allowUmd && config.umdInputs.length > 0 && !config.formats.includes('umd')) {
        config.formats.push('umd');
    }

    for (const plugin of plugins) {
        plugin.processPackageJson?.(pkg as PackageJson, inputs);
    }

    if (config.bin) {
        if (config.bin.length > 0) {
            if (config.bin[0] !== '') {
                pkg.bin = config.bin[0] as string;
            }
            config.bin = config.bin.filter(Boolean);
            if (config.bin.length === 0) {
                config.bin = undefined;
            }
        }
    } else if (allowCjs && inputs.length > 0) {
        if (typeof pkg.bin === 'string') {
            if (inputs.some(input => pkg.bin === `./${config.dir}/${patternToName(config.commonjsPattern, path.basename(input, path.extname(input)))}`)) {
                config.bin = [pkg.bin];
            }
        } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            const executables = Object.values(pkg.bin).filter(value => typeof value === 'string' && inputs.some(input => value === `./${config.dir}/${patternToName(config.commonjsPattern, path.basename(input, path.extname(input)))}`)) as string[];
            if (executables.length > 0) {
                config.bin = executables;
            }
        }
        if (typeof pkg.directories === 'object' && pkg.directories != null && 'bin' in pkg.directories && typeof pkg.directories.bin === 'string') {
            if (path.resolve(pkg.directories.bin) === path.resolve(config.dir)) {
                config.bin?.push(...inputs.map(input => `./${config.dir}/${patternToName(config.commonjsPattern, input)}`));
                config.bin = Array.from(new Set(config.bin));
            }
        }
    }

    return [inputs, inputsExt];

    async function updateExtensions(id: string) {
        const sourceFileWithoutSuffix = `./${config.sourceDir}/${id}.`;

        for (const suffix of sourceFileSuffixes) {
            const file = sourceFileWithoutSuffix + suffix;
            if (await isExists(file)) {
                inputs.push(file);
                inputsExt.set(id, suffix);
                break;
            }
        }
    }
}

function patternToName(pattern: string, input: string) {
    return pattern.replace('[name]', input);
}

function orderFields<T extends object>(firstFields: Set<string>, exports: T, lastFields: Set<string> = emptySet) {
    const ordered: T = {} as T;

    for (const key of firstFields) {
        if (key as keyof T in exports) {
            (ordered as Record<string, unknown>)[key] = (exports as Record<string, unknown>)[key];
        }
    }

    for (const key in exports) {
        if (!firstFields.has(key) && !lastFields.has(key)) {
            (ordered as Record<string, unknown>)[key] = (exports as Record<string, unknown>)[key];
        }
    }

    for (const key of lastFields) {
        if (key as keyof T in exports) {
            (ordered as Record<string, unknown>)[key] = (exports as Record<string, unknown>)[key];
        }
    }

    return ordered;
}