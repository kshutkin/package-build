import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import preprocess from 'rollup-plugin-preprocess';
import clean from '@rollup-extras/plugin-clean';
import binify from '@rollup-extras/plugin-binify';
import externals from '@rollup-extras/plugin-externals';

const input = 'src/index.ts';

const dest = 'dist';

const plugins = [
    clean(),
    externals(),
    resolve(),
    commonjs(),
    typescript(),
    binify()
];

export default {
    input,

    output: {
        format: 'cjs',
        dir: dest,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js'
    },

    plugins: [preprocess.default({ include: [ 'src/index.ts' ], context: { esm: false } }), ...plugins]
};