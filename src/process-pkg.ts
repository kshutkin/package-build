import path from 'path';
import { getCliOptions } from './get-cli-options';
import { createLogger, LogLevel } from '@niceties/logger';
import { umdFilter } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function processPackage(pkg: any, config: ReturnType<typeof getCliOptions>): string[] {
    const input = [];
    const logger = createLogger();
    if (typeof pkg.name !== 'string') {
        logger.finish('expecting name to be a string in package.json', LogLevel.error);
        process.exit(-1);
    }
    
    if (!Array.isArray(pkg.files)) {
        pkg.files = [];
    }
    
    if (!pkg.files.includes(config.dir)) {
        pkg.files.push(config.dir);
    }
    
    if (typeof pkg.exports !== 'object') {
        pkg.exports = {};
    }

    if (pkg.exports['.'] == null) {
        pkg.exports['.'] = {};
    }

    pkg.exports['./package.json'] = './package.json';
    
    if (typeof pkg.umd === 'string') {
        pkg.umd = `./${config.dir}/index.umd.js`;
        if (!config.umdTargets.includes('index')) {
            config.umdTargets.push('index');
        }
    }

    if (typeof pkg.main !== 'string') {
        pkg.main = `./${config.dir}/index.cjs`;
    }
    
    if (pkg.main !== pkg.exports['.'].require) {
        pkg.exports['.'].require = pkg.main;
    }
    
    if (typeof pkg.module !== 'string') {
        pkg.module = `./${config.dir}/index.mjs`;
    }
    
    if (pkg.module !== pkg.exports['.']?.default) {
        pkg.exports['.'].default = pkg.module;
    }
    
    if (umdFilter(config, 'index')) {
        pkg.unpkg = `./${config.dir}/index.umd.js`;
    }
    
    for (const id in pkg.exports) {
        if (id === './package.json') continue;
        const basename = id == '.' ? 'index' : path.basename(id);
        if (typeof pkg.exports[id] !== 'object') {
            pkg.exports[id] = {};
        }
        pkg.exports[id].require = `./${config.dir}/${basename}.cjs`;
        pkg.exports[id].default = `./${config.dir}/${basename}.mjs`;
    
        if (basename !== 'index') {
            if (!pkg.files.includes(basename)) {
                pkg.files.push(basename);
            }
        }
    
        input.push(`./${config.sourceDir}/${basename}.ts`);
    }

    return input;
}
