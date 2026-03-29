import fs from 'node:fs/promises';
import path from 'node:path';

import camelCase from 'lodash/camelCase.js';

import pkgbldPkg from '../package.json' with { type: 'json' };

/**
 * @typedef {import('rollup').RollupOptions} RollupOptions
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').PkgbldRollupPlugin} PkgbldRollupPlugin
 * @typedef {import('./types.js').Provider} Provider
 */

const imports = new Map();
const setup = new Set();

/** @type {<T extends object>(object: T) => string | boolean | RegExp | null | undefined} */
let generate;
/** @type {() => string} */
let generateGlobals;

/**
 * @param {Map<string, Promise<never>>} preimportMap
 * @returns {Promise<[Provider, PkgbldRollupPlugin[]]>}
 */
export async function createEjectProvider(preimportMap) {
    const createMockProvider = (await import('@slimlib/smart-mock')).default;
    const provider = createMockProvider();
    const createMock = provider.createMock;
    generate = provider.generate;
    generateGlobals = provider.generateGlobals;
    /** @type {PkgbldRollupPlugin[]} */
    const plugins = [];
    return [
        {
            provide: (
                /** @type {PkgbldRollupPlugin['plugin']} */ plugin,
                /** @type {PkgbldRollupPlugin['priority']} */ priority,
                /** @type {Omit<PkgbldRollupPlugin, 'plugin' | 'priority'>=} */ options
            ) => {
                plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
            },
            import: async (/** @type {string} */ name, /** @type {string=} */ exportName) => {
                const result = preimportMap.has(name) ? await preimportMap.get(name) : await import(name);
                const exports = result[exportName ?? 'default'];
                const mangledName = camelCase(name);
                imports.set(name, mangledName);
                return createMock(exports, mangledName);
            },
            globalImport: (/** @type {string} */ module, /** @type {string | string[]=} */ exportName) => {
                imports.set(module, exportName ?? 'default');
            },
            globalSetup: (/** @type {(() => void) | string} */ code) => {
                if (typeof code === 'function') {
                    setup.add(code.toString());
                }
                setup.add(String(code));
            },
        },
        plugins,
    ];
}

/**
 * @param {RollupOptions[]} config
 * @param {string} pkgPath
 * @param {CliOptions} options
 * @param {string[]} inputs
 * @param {Map<string, string>} inputsExt
 * @param {ReturnType<import('./helpers.js').getHelpers>} helpers
 * @param {PackageJson} pkg
 */
export async function ejectConfig(config, pkgPath, options, inputs, inputsExt, helpers, pkg) {
    const pkgName = /** @type {{ name: string }} */ (pkg).name;

    const text = generate(config);
    setup.add(generateGlobals());

    setup.add(`const config = ${generate(options)}`);
    setup.add(`const inputs = ${generate(inputs)}`);
    setup.add(`const inputsExt = new Map(${generate(Array.from(inputsExt))})`);

    if (options.formats.includes('umd')) {
        imports.set('path', 'path');
        imports.set('lodash/camelCase.js', 'camelCase');
        imports.set('url', 'url');
        setup.add(`const pkgName = ${generate(/** @type {never} */ (pkgName))}`);
        setup.add(helpers.getGlobalName.toString());
        setup.add("const __dirname = url.fileURLToPath(new URL('.', import.meta.url));");
    }

    const importsString = Array.from(imports)
        .map(value => `import ${value[1]} from '${value[0]}';`)
        .join('\n');
    const setupString = Array.from(setup).join('\n');

    const { minify } = await import('terser');

    const result = await minify(`${importsString}\n${setupString}\nexport default ${text};`, {
        module: true,
        compress: {
            booleans: false,
            ecma: 2020,
            module: true,
            passes: 3,
            unsafe: true,
        },
        mangle: false,
        output: {
            beautify: true,
            ecma: 2020,
            quote_style: 1,
        },
    });
    await fs.writeFile(path.join(path.dirname(pkgPath), 'rollup.config.mjs'), /** @type {string} */ (result.code));

    await updatePackageJson(pkg);
}

/**
 * @param {PackageJson} pkg
 */
async function updatePackageJson(pkg) {
    if (typeof pkg.devDependencies !== 'object') {
        pkg.devDependencies = {};
    }
    const devDependencies = pkg.devDependencies;
    if ('pkgbld' in devDependencies) {
        devDependencies.pkgbld = undefined;
    }
    devDependencies.rollup = /** @type {Record<string, string>} */ (pkgbldPkg.dependencies).rollup ?? '*';
    const isBuiltin = (await import('is-builtin-module')).default;
    for (const key of imports.keys()) {
        const packageName = getPackageName(key);
        if (!isBuiltin(packageName)) {
            devDependencies[packageName] = /** @type {Record<string, string>} */ (pkgbldPkg.dependencies)[packageName] ?? '*';
        }
    }
}

/**
 * @param {string} key
 * @returns {string}
 */
function getPackageName(key) {
    return key
        .split('/')
        .slice(0, key.startsWith('@') ? 2 : 1)
        .join('/');
}
