import path from 'node:path';

import { createBundle } from 'dts-buddy';

/**
 * @typedef {import('pkgbld').BuildConfigurationDraft} BuildConfigurationDraft
 * @typedef {import('pkgbld').Json} Json
 * @typedef {import('pkgbld').PackageJson} PackageJson
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
     * @param {{ draft: BuildConfigurationDraft }} context
     */
    function configure({ draft }) {
        dir = draft.paths.outputDir;
        config.output = path.join(dir, 'index.d.ts');
        draft.typescript.updateConfig = true;
    }

    /**
     * @param {{ packageJson: PackageJson; entries: import('pkgbld').BuildEntries }} context
     */
    function processPackageJson({ packageJson, entries }) {
        pkgName = packageJson.name ?? '';
        for (const entry of entries.values) {
            if (entry.origin === 'import') continue;
            config.modules[getOutputName(entry.name)] = entry.sourcePath;
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
     * @param {{ config: Json }} context
     */
    function processTsConfig({ config }) {
        isDeclarationsEnabled = getIsDeclarationsEnabled(config);
    }

    async function buildEnd() {
        if (!isDeclarationsEnabled) {
            return;
        }

        await createBundle(config);
    }

    return {
        configure,
        processPackageJson,
        processTsConfig,
        buildEnd,
    };

    /**
     * @param {string} entryName
     */
    function getOutputName(entryName) {
        if (entryName === 'index') {
            return pkgName;
        }
        return `${pkgName}/${entryName}`;
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
