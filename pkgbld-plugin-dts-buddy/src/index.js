import path from 'node:path';

import { createBundle } from 'dts-buddy';

/**
 * @typedef {import('pkgbld').CliOptions} CliOptions
 * @typedef {import('pkgbld').Json} Json
 * @typedef {import('pkgbld').PackageJson} PackageJson
 * @typedef {import('pkgbld').ParsedOptions} ParsedOptions
 */

export function create() {
    let isDeclarationsEnabled = false;
    const config = {
        project: 'tsconfig.json',
        output: '',
        modules: /** @type {Record<string, string>} */ ({}),
    };

    /** @type {string} */
    let dir;
    /** @type {string} */
    let pkgName;

    /**
     * @param {ParsedOptions} _parsedArgs
     * @param {CliOptions} options
     */
    function options(_parsedArgs, options) {
        dir = options.dir;
        config.output = path.join(dir, 'index.d.ts');
        options.tsConfig = true;
    }

    /**
     * @param {PackageJson} packageJson
     * @param {string[]} inputs
     */
    function processPackageJson(packageJson, inputs) {
        pkgName = packageJson.name ?? '';
        for (const input of inputs) {
            config.modules[getOutputName(input)] = input;
        }
        if (typeof packageJson.typings === 'string') {
            packageJson.typings = undefined;
        }
        packageJson.types = `./${dir}/index.d.ts`;
        if (packageJson.exports && typeof packageJson.exports === 'object' && !Array.isArray(packageJson.exports)) {
            for (const id in packageJson.exports) {
                if (id === './package.json') continue;
                const entry = packageJson.exports[id];
                if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
                    const basename = id === '.' ? 'index' : path.join(path.dirname(id), path.basename(id));
                    const typesPath = `./${dir}/${basename}.d.ts`;
                    packageJson.exports[id] = { types: typesPath, ...entry };
                }
            }
        }
        return config;
    }

    /**
     * @param {Json} config
     */
    function processTsConfig(config) {
        isDeclarationsEnabled = getIsDeclarationsEnabled(config);
    }

    async function buildEnd() {
        if (!isDeclarationsEnabled) {
            return;
        }

        await createBundle(config);
    }

    return {
        options,
        processPackageJson,
        processTsConfig,
        buildEnd,
    };

    /**
     * @param {string} input
     */
    function getOutputName(input) {
        if (path.basename(input, path.extname(input)) === 'index') {
            return pkgName;
        }
        return `${pkgName}/${path.basename(input, path.extname(input))}`;
    }
}

/**
 * @param {Json | null | undefined | string | number | boolean | Json[] | { [name: string]: Json }} tsConfig
 */
function getIsDeclarationsEnabled(tsConfig) {
    const isDeclarations =
        typeof tsConfig === 'object' &&
        tsConfig != null &&
        'compilerOptions' in tsConfig &&
        typeof tsConfig.compilerOptions === 'object' &&
        tsConfig.compilerOptions !== null &&
        'declaration' in tsConfig.compilerOptions &&
        tsConfig.compilerOptions.declaration === true;

    return isDeclarations;
}
