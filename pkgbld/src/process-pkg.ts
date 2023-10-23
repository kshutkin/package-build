import path from 'path';
import { createLogger, LogLevel } from '@niceties/logger';
import { CliOptions, Json, PackageJson, PkgbldPlugin } from './types';

const emptySet = new Set as Set<string>;

export function processPackage(pkg: Json, config: CliOptions, plugins: Partial<PkgbldPlugin>[]): string[] {
    const exportsFields = new Set([
        'types',
        'import',
        'require',
        'svelte',
        'default'
    ]);
    
    const typingsFilePattern = '[name].d.ts';
    
    const indexId = 'index';
    
    const typesVersionsLastFields = new Set(['*']);

    const inputs = [];
    const logger = createLogger();
    const allowEsm = (config.formatsOverridden && config.formats.includes('es') || !config.formatsOverridden);
    const allowCjs = (config.formatsOverridden && config.formats.includes('cjs') || !config.formatsOverridden);
    const allowUmd = (config.formatsOverridden && config.formats.includes('umd') || !config.formatsOverridden || config.umdInputs);

    if (typeof pkg !== 'object' || Array.isArray(pkg)) {
        logger.finish('expecting object on top level of package.json', LogLevel.error);
        process.exit(-1);
    }

    if (typeof pkg?.name !== 'string') {
        logger.finish('expecting name to be a string in package.json', LogLevel.error);
        process.exit(-1);
    }
    
    if (!Array.isArray(pkg?.files)) {
        pkg.files = [];
    }
    
    if (!pkg.files.includes(config.dir)) {
        pkg.files.push(config.dir);
    }
    
    if (typeof pkg.exports !== 'object' && pkg.exports !== null) {
        pkg.exports = {};
    }

    if (typeof pkg.scripts !== 'object' && pkg.scripts !== null) {
        pkg.scripts = {};
    }

    if (!('prepack' in (pkg.scripts as Record<string, Json>))) {
        const binary = typeof (pkg.scripts as Record<string, string>).build === 'string' && (pkg.scripts as Record<string, string>).build?.startsWith('pkgbld-internal')  ? 'pkgbld-internal' : 'pkgbld';
        (pkg.scripts as Record<string, Json>).prepack = `${binary} prune`;
    }

    if ((pkg.exports as Record<string, Json>)['.'] == null) {
        (pkg.exports as Record<string, Json>)['.'] = {};
    }

    (pkg.exports as Record<string, Json>)['./package.json'] = './package.json';

    if (allowEsm && !allowCjs && typeof pkg.type !== 'string') {
        pkg.type = 'module';
    }

    if (typeof pkg.typings === 'string') {
        delete pkg.typings;
    }

    pkg.types = `./${config.dir}/index.d.ts`; 
    
    if (allowUmd && typeof pkg.umd === 'string') {
        pkg.umd = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
        if (!config.umdInputs.includes(indexId)) {
            config.umdInputs.push(indexId);
        }
    }

    if (config.bin) {
        if (config.bin.length > 0) {
            if (config.bin[0] === '') {
                delete pkg.bin;
            } else {
                pkg.bin = config.bin[0] as string;
            }
            config.bin = config.bin.filter(Boolean);
            if (config.bin.length === 0) {
                delete config.bin;
            }
        }
    } else if (typeof pkg.bin === 'string') {
        config.bin = [pkg.bin];
    } else {
        delete pkg.bin;
    }

    if (allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.commonjsPattern, indexId)}`;
    }

    if (allowEsm && !allowCjs) {
        pkg.main = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }
    
    if (allowCjs && pkg.main !== ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).require) {
        ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).require = pkg.main as Json;
    }
    
    if (allowCjs && allowEsm && typeof pkg.module !== 'string') {
        pkg.module = `./${config.dir}/${patternToName(config.esPattern, indexId)}`;
    }
    
    if (pkg.module !== ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>)?.default) {
        ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).default = pkg.module as Json;
    }
    
    if (allowUmd && config.umdInputs.includes(indexId)) {
        pkg.unpkg = `./${config.dir}/${patternToName(config.umdPattern, indexId)}`;
    }

    if (typeof pkg.typesVersions !== 'object' && pkg.typesVersions !== null) {
        pkg.typesVersions = {};
    }
    
    if (typeof (pkg.typesVersions as Record<string, Json>)['*'] !== 'object' && (pkg.typesVersions as Record<string, Json>)['*'] !== null) {
        (pkg.typesVersions as Record<string, Json>)['*'] = {};
    }

    for (const id in pkg.exports) {
        if (id === './package.json') continue;

        const basename = id == '.' ? indexId : path.basename(id);

        if (typeof (pkg.exports as Record<string, Json>)[id] !== 'object') {
            (pkg.exports as Record<string, Json>)[id] = {};
        }

        ((pkg.typesVersions as Record<string, Json>)['*'] as Record<string, Json>)[id] = [`${config.dir}/${patternToName(typingsFilePattern, basename)}`];

        ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>).types = `./${config.dir}/${patternToName(typingsFilePattern, basename)}`;

        if (allowEsm) {
            ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>).import = `./${config.dir}/${patternToName(config.esPattern, basename)}`;
        }

        if (allowCjs) {
            ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>).require = `./${config.dir}/${patternToName(config.commonjsPattern, basename)}`;
        }

        ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>) = orderFields(exportsFields,(pkg.exports as Record<string, Json>)[id] as Record<string, Json>);
    
        if (basename !== indexId) {
            if (!pkg.files.includes(basename)) {
                pkg.files.push(basename);
            }
        }
    
        inputs.push(`./${config.sourceDir}/${basename}.ts`);
    }

    ((pkg.typesVersions as Record<string, Json>)['*'] as Record<string, Json>)['*'] = [
        `${config.dir}/${patternToName(typingsFilePattern, indexId)}`,
        `${config.dir}/*`
    ];

    ((pkg.typesVersions as Record<string, Json>)['*'] as Record<string, Json>) = orderFields(emptySet, (pkg.typesVersions as Record<string, Json>)['*'] as Record<string, Json>, typesVersionsLastFields);

    if (allowUmd && config.umdInputs.length > 0 && !config.formats.includes('umd')) {
        config.formats.push('umd');
    }

    for (const plugin of plugins) {
        plugin.processPackageJson?.(pkg as PackageJson, inputs, logger);
    }

    return inputs;
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