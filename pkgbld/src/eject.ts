import type { PkgbldRollupPlugin, Provider } from './types';
import type { RollupOptions } from 'rollup';
import fs from 'fs/promises';
import path from 'path';
import { camelCase } from 'lodash';
import { getCliOptions } from './get-cli-options';
import { getHelpers } from './helpers';

const imports = new Map<string, string | string[]>;
const setup = new Set<string>;

let generate: <T extends object>(object: T) => string | boolean | RegExp | null | undefined,
    generateGlobals: () => string;

export async function createEjectProvider() {
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        import: async (name: string, exportName?: string) => {
            const result = await import(name);
            const exports = result[exportName ?? 'default'];
            const mangledName = camelCase(name);
            imports.set(name, mangledName);
            return createMock(exports, mangledName);
        },
        globalImport: (module: string, exportName?: string | string[]) => {
            imports.set(module, exportName ?? 'default');
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-types
        globalSetupt: (code: Function | string) => {
            if (typeof code === 'function') {
                setup.add(code.toString());
            }
            setup.add(String(code));
        }
    }, plugins] as [Provider, PkgbldRollupPlugin[]];
}

export async function ejectConfig(config: RollupOptions[], pkgPath: string, options: ReturnType<typeof getCliOptions>, inputs: string[], helpers: ReturnType<typeof getHelpers>, pkgName: string) {
    // generate from config
    const text = generate(config);
    setup.add(generateGlobals());

    // generate globals for config functions
    setup.add(`const config = ${generate(options)}`);
    setup.add(`const inputs = ${generate(inputs)}`);

    // generate helpers code
    if (options.formats.includes('umd')) {
        imports.set('path', 'path');
        imports.set('lodash/camelCase', 'camelCase');
        setup.add(`const pkgName = ${generate(pkgName as any)}`);
        setup.add(helpers.getGlobalName.toString());
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
    await fs.writeFile(path.join(path.dirname(pkgPath), 'rollup.config.js'), result.code as string);
    // add packages into package.json
    // write tsconfig.json
}