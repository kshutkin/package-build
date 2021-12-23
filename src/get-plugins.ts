import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import preprocess from 'rollup-plugin-preprocess';
import { terser } from 'rollup-plugin-terser';

import { InternalModuleFormat, Plugin } from 'rollup';
import { getCliOptions } from './get-cli-options';

export function getBuildPlugins(format: InternalModuleFormat, config: ReturnType<typeof getCliOptions>): Plugin[] {
    const result = [
        resolve(),
        commonjs(),
        typescript()
    ];

    if (config.preprocess.length) {
        result.unshift(preprocess({ include: config.preprocess.map(name => `src/${name}.ts`), context: getPreprocessContext(format) }));
    }

    return result as Plugin[];
}

function getPreprocessContext(format: InternalModuleFormat) {
    if (format == 'es') {
        return { esm: true };
    } else {
        return { cjs: true };
    }
}

export function getOutputPlugins(format: InternalModuleFormat, config: ReturnType<typeof getCliOptions>): Plugin[] {
    return config.compressTargets.includes(format) ? [terser({
        mangle: {
            properties: {
                regex: /_$/
            }
        }
    })] : [];
}