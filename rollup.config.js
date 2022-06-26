import isBuiltinModule from 'is-builtin-module';

import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import preprocess from 'rollup-plugin-preprocess';
import clean from '@rollup-extras/plugin-clean';

const input = 'src/index.ts';

const dest = 'dist';

const plugins = [
    clean(),
    resolve(),
    commonjs(),
    typescript()
];

const external = (id) => id.indexOf('node_modules') >= 0 || isBuiltinModule(id);

export default {
    input,

    output: {
        format: 'cjs',
        dir: dest,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js'
    },

    plugins: [preprocess({ include: [ 'src/index.ts' ], context: { esm: false } }), ...plugins],

    external
};