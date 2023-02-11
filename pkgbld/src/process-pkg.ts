

import path from 'path';
import { getCliOptions } from './get-cli-options';
import { createLogger, LogLevel } from '@niceties/logger';
import { Json } from './types';

export function processPackage(pkg: Json, config: ReturnType<typeof getCliOptions>): string[] {
    const input = [];
    const logger = createLogger();
    const allowEsm = (config.formatsOverriden && config.formats.includes('es') || !config.formatsOverriden);
    const allowCjs = (config.formatsOverriden && config.formats.includes('cjs') || !config.formatsOverriden);
    const allowUmd = (config.formatsOverriden && config.formats.includes('umd') || !config.formatsOverriden || config.umdInputs);

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

    if ((pkg.exports as Record<string, Json>)['.'] == null) {
        (pkg.exports as Record<string, Json>)['.'] = {};
    }

    (pkg.exports as Record<string, Json>)['./package.json'] = './package.json';
    
    if (allowUmd && typeof pkg.umd === 'string') {
        pkg.umd = `./${config.dir}/index.umd.js`;
        if (!config.umdInputs.includes('index')) {
            config.umdInputs.push('index');
        }
    }

    if (config.bin) {
        if (config.bin.length > 0) {
            if (config.bin[0] === '') {
                delete pkg.bin;
            } else {
                pkg.bin = config.bin[0];
            }
            config.bin = config.bin.filter(Boolean);
            if (config.bin.length === 0) {
                delete config.bin;
            }
        }
    } else {
        if (typeof pkg.bin === 'string') {
            config.bin = [pkg.bin];
        } else {
            delete pkg.bin;
        }
    }

    if (allowCjs && typeof pkg.main !== 'string') {
        pkg.main = `./${config.dir}/index.cjs`;
    }
    
    if (allowCjs && pkg.main !== ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).require) {
        ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).require = pkg.main;
    }
    
    if (allowEsm && typeof pkg.module !== 'string') {
        pkg.module = `./${config.dir}/index.mjs`;
    }
    
    if (allowEsm && pkg.module !== ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>)?.default) {
        ((pkg.exports as Record<string, Json>)['.'] as Record<string, Json>).default = pkg.module;
    }
    
    if (allowUmd && config.umdInputs.includes('index')) {
        pkg.unpkg = `./${config.dir}/index.umd.js`;
    }
    
    for (const id in pkg.exports) {
        if (id === './package.json') continue;
        const basename = id == '.' ? 'index' : path.basename(id);
        if (typeof (pkg.exports as Record<string, Json>)[id] !== 'object') {
            (pkg.exports as Record<string, Json>)[id] = {};
        }
        if (allowCjs) {
            ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>).require = `./${config.dir}/${basename}.cjs`;
        }
        if (allowEsm) {
            ((pkg.exports as Record<string, Json>)[id] as Record<string, Json>).default = `./${config.dir}/${basename}.mjs`;
        }
    
        if (basename !== 'index') {
            if (!pkg.files.includes(basename)) {
                pkg.files.push(basename);
            }
        }
    
        input.push(`./${config.sourceDir}/${basename}.ts`);
    }

    if (allowUmd && config.umdInputs.length > 0 && !config.formats.includes('umd')) {
        config.formats.push('umd');
    }

    return input;
}