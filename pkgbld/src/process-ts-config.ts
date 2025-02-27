import path from 'node:path';
import type { Logger } from '@niceties/logger';
import { writeJson } from './write-json';
import type { CliOptions, PkgbldPlugin } from './types';
import { getJson } from './get-json';
import cloneDeep from 'lodash/cloneDeep.js';
import isEqual from 'lodash/isEqual.js';
import type { JsonObject } from 'type-fest';

const defaultTsConfig = {
    include: ['src', 'types'],
    compilerOptions: {
        lib: ['dom', 'esnext'],
        target: 'esnext',
        module: 'esnext',
        esModuleInterop: true,
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        sourceMap: true,
        noUncheckedIndexedAccess: true,
        declaration: true,
        moduleResolution: 'node'
    }
};

export async function checkTsConfig(options: CliOptions, mainLogger: Logger, plugins: Partial<PkgbldPlugin>[]) {
    if (options.noTsConfig) {
        return;
    }
    // biome-ignore lint/style/useSingleVarDeclarator: <explanation>
    let config: JsonObject | undefined, needWrite = false;
    try {
        [, config] = await getJson('tsconfig.json');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(_) {/*ignore*/}
    try {
        [, config] = await getJson('jsconfig.json');
        if (config && typeof config === 'object' && !Array.isArray(config)) {
            config.allowJs = true;
        }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(_) {/*ignore*/}
    if (!config) {
        config = defaultTsConfig;
        needWrite = true;
    }
    const originalConfig = cloneDeep(config);
    for (const plugin of plugins) {
        plugin.processTsConfig?.(config);
    }
    if (!isEqual(originalConfig, config)) {
        needWrite = true;
    }
    if (needWrite) {
        mainLogger('no tsconfig.json or jsconfig.json and --no-ts-config not specified, writing tsconfig...');
        await writeJson(path.resolve('tsconfig.json'), config);
        mainLogger('done');
    }
    return config;
}
