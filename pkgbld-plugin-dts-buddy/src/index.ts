import type { CliOptions, Json, PackageJson, ParsedOptions } from 'pkgbld';
import path from 'path';
import { createBundle } from 'dts-buddy';

let isDeclarationsEnabled = false;
const config = {
    project: 'tsconfig.json',
    output: '',
    modules: {} as Record<string, string>
};

let dir: string;
let pkgName: string;

const jsExtensions = ['js', 'jsx', 'cjs', 'mjs'];

export function options(_parsedArgs: ParsedOptions, options: CliOptions) {
    if (options.kind === 'build') {
        dir = options.dir;
        config.output = path.join(dir, 'index.d.ts');
    }
}

export function processPackageJson(packageJson: PackageJson, inputs: string[]) {
    pkgName = packageJson.name ?? '';
    for (const input of inputs) {
        const extension = path.extname(input);
        if (jsExtensions.includes(extension.slice(1))) {
            config.modules[getOutputName(input)] = input;
        } else {
            config.modules[getOutputName(input)] = path.join(dir, path.basename(input, extension) + '.d.ts');
        }
    }
    return config;
}

export function processTsConfig(config: Json) {
    isDeclarationsEnabled = getIsDeclarationsEnabled(config);
}

export async function buildEnd() {
    if (!isDeclarationsEnabled) {
        return;
    }

    await createBundle(config);
}

function getOutputName(input: string) {
    if (path.basename(input, path.extname(input)) === 'index') {
        return pkgName;
    }
    return pkgName + '/' + path.basename(input, path.extname(input));
}

function getIsDeclarationsEnabled(tsConfig: Json | null | undefined | string | number | boolean | Json[] | { [name: string]: Json }) {
    const isDeclarations = typeof tsConfig === 'object'
        && tsConfig != null && 'compilerOptions' in tsConfig
        && typeof tsConfig.compilerOptions === 'object' && tsConfig.compilerOptions !== null
        && 'declaration' in tsConfig.compilerOptions && tsConfig.compilerOptions.declaration === true;

    return isDeclarations;
}