import path from 'path';
import fsSync from 'fs';
import { Logger } from '@niceties/logger';
import { writeJson } from './write-json';
import { CliOptions, Json, PkgbldPlugin } from './types';
import { getJson } from './get-json';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';

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
        noUncheckedIndexedAccess: true,
        declaration: true,
        moduleResolution: 'node'
    }
};

export async function checkTsConfig(options: CliOptions, mainLogger: Logger, plugins: Partial<PkgbldPlugin>[]) {
    if (options.noTsConfig) {
        return;
    }
    const tsConfigPath = path.resolve('tsconfig.json');
    let config: Json, needWrite = false;
    if (fsSync.existsSync(tsConfigPath)) {
        [, config] = await getJson('tsconfig.json');
    } else {
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
        mainLogger('no tsconfig.json and --no-ts-config not specified, writing tsconfig...');
        await writeJson(tsConfigPath, config);
        mainLogger('done');
    }
}
