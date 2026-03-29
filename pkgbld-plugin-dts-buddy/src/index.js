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

    const jsExtensions = ['js', 'jsx', 'cjs', 'mjs'];

    /**
     * @param {ParsedOptions} _parsedArgs
     * @param {CliOptions} options
     */
    function options(_parsedArgs, options) {
        if (options.kind === 'build') {
            dir = options.dir;
            config.output = path.join(dir, 'index.d.ts');
            options.noSubpackages = true;
        }
    }

    /**
     * @param {PackageJson} packageJson
     * @param {string[]} inputs
     */
    function processPackageJson(packageJson, inputs) {
        pkgName = packageJson.name ?? '';
        for (const input of inputs) {
            const extension = path.extname(input);
            if (jsExtensions.includes(extension.slice(1))) {
                config.modules[getOutputName(input)] = input;
            } else {
                config.modules[getOutputName(input)] = path.join(dir, `${path.basename(input, extension)}.d.ts`);
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
