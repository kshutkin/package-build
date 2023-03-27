import path from 'path';
import fs from 'fs';
import { Logger } from '@niceties/logger';
import { getCliOptions } from './get-cli-options';
import { writeJson } from './write-json';

const defaultTsConfig = {
    include: ['src', 'types'],
    compilerOptions: {
        lib: ['dom', 'esnext'],
        target: 'esnext',
        module: 'esnext',
        esModuleInterop: true,
        strict: true,
        declaration: true,
        moduleResolution: 'node'
    }
};

export async function checkTsConfig(options: ReturnType<typeof getCliOptions>, mainLogger: Logger) {
    if (options.noTsConfig) {
        return;
    }
    const tsConfigPath = path.resolve('tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
        return;
    }
    mainLogger('no tsconfig.json and --no-ts-config not specified, writing tsconfig...');
    await writeJson(tsConfigPath, defaultTsConfig);
    mainLogger('done');
}
