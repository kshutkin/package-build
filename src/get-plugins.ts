import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import preprocess from 'rollup-plugin-preprocess';
import terser from '@rollup/plugin-terser';
import cleanFactory from '@rollup-extras/plugin-clean';
import externals from '@rollup-extras/plugin-externals';

import { InternalModuleFormat, Plugin } from 'rollup';
import { getCliOptions } from './get-cli-options';
import { isExternalInput } from './helpers';

const clean = cleanFactory();

export function getBuildPlugins(format: InternalModuleFormat, config: ReturnType<typeof getCliOptions>, inputs?: string[], currentInput?: string): Plugin[] {
    const result: Plugin[] = [
        externals({
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            external: (id, external) => external || (format === 'umd' ? isExternalInput(id, inputs!, currentInput!, config) : false)
        }),
        resolve(),
        commonjs(),
        typescript()
    ];

    if (config.preprocess.length) {
        result.unshift(preprocess({ include: config.preprocess.map(name => `${config.sourceDir}/${name}.ts`), context: { [format]: true } }));
    }

    return result;
}

export function getOutputPlugins(format: InternalModuleFormat, config: ReturnType<typeof getCliOptions>): Plugin[] {
    const result: Plugin[] = [
        clean
    ];
    if (config.compressFormats.includes(format)) {
        result.push(terser({
            mangle: {
                properties: {
                    regex: /_$/
                }
            }
        }));
    }
    
    return result;
}