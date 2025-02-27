import type { CliOptions, PkgbldRollupPlugin, Provider } from './types';
import type { RollupOptions } from 'rollup';
import fs from 'node:fs/promises';
import path from 'node:path';
import camelCase from 'lodash/camelCase.js';
import type { getHelpers } from './helpers';
import pkgbldPkg from '../package.json';
import type { PackageJson } from 'type-fest';

const imports = new Map<string, string | string[]>;
const setup = new Set<string>;

let generate: <T extends object>(object: T) => string | boolean | RegExp | null | undefined,
    generateGlobals: () => string;

export async function createEjectProvider(preimportMap: Map<string, Promise<never>>) {
    const createMockProvider = (await import('@slimlib/smart-mock')).default;
    const provider = createMockProvider();
    const createMock = provider.createMock;
    generate = provider.generate;
    generateGlobals = provider.generateGlobals;
    const plugins: PkgbldRollupPlugin[] = [];
    return [{
        provide: (plugin: PkgbldRollupPlugin['plugin'], priority: PkgbldRollupPlugin['priority'], options?: Omit<PkgbldRollupPlugin, 'plugin' | 'priority'>) => {
            plugins.push({ priority, plugin, format: options?.format, inputs: options?.inputs, outputPlugin: options?.outputPlugin });
        },
        import: async (name: string, exportName?: string) => {
            const result = preimportMap.has(name) ? await preimportMap.get(name) : await import(name);
            const exports = result[exportName ?? 'default'];
            const mangledName = camelCase(name);
            imports.set(name, mangledName);
            return createMock(exports, mangledName);
        },
        globalImport: (module: string, exportName?: string | string[]) => {
            imports.set(module, exportName ?? 'default');
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        globalSetup: (code: Function | string) => {
            if (typeof code === 'function') {
                setup.add(code.toString());
            }
            setup.add(String(code));
        }
    }, plugins] as [Provider, PkgbldRollupPlugin[]];
}

export async function ejectConfig(config: RollupOptions[], pkgPath: string, options: CliOptions, inputs: string[], inputsExt: Map<string, string>, helpers: ReturnType<typeof getHelpers>, pkg: PackageJson) {

    const pkgName = (pkg as { name: string }).name;

    // generate from config
    const text = generate(config);
    setup.add(generateGlobals());

    // generate globals for config functions
    setup.add(`const config = ${generate(options)}`);
    setup.add(`const inputs = ${generate(inputs)}`);
    setup.add(`const inputsExt = new Map(${generate(Array.from(inputsExt))})`);

    // generate helpers code
    if (options.formats.includes('umd')) {
        imports.set('path', 'path');
        imports.set('lodash/camelCase.js', 'camelCase');
        imports.set('url', 'url'); // for __dirname polyfill
        setup.add(`const pkgName = ${generate(pkgName as never)}`);
        setup.add(helpers.getGlobalName.toString());
        // polyfill __dirname
        setup.add('const __dirname = url.fileURLToPath(new URL(\'.\', import.meta.url));');
    }

    // imports
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
            ecma: 2020,
            module: true,
            passes: 3,
            unsafe: true
        },
        mangle: false,
        output: {
            beautify: true,
            ecma: 2020,
            quote_style: 1
        }
    });
    await fs.writeFile(path.join(path.dirname(pkgPath), 'rollup.config.mjs'), result.code as string);

    await updatePackageJson(pkg);
}

async function updatePackageJson(pkg: PackageJson) {
    if (typeof pkg.devDependencies !== 'object') {
        pkg.devDependencies = {};
    }
    const devDependencies = pkg.devDependencies;
    if ('pkgbld' in devDependencies) {
        devDependencies.pkgbld = undefined;
    }
    devDependencies.rollup = (pkgbldPkg.dependencies as Record<string, string>).rollup ?? '*';
    const isBuiltin = (await import('is-builtin-module')).default;
    for (const key of imports.keys()) {
        const packageName = getPackageName(key);
        if (!isBuiltin(packageName)) {
            devDependencies[packageName] = (pkgbldPkg.dependencies as Record<string, string>)[packageName] ?? '*';
        }
    }
}

function getPackageName(key: string) {
    return key.split('/').slice(0, key.startsWith('@') ? 2 : 1).join('/');
}