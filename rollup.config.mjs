import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import clean from '@rollup-extras/plugin-clean';
import binify from '@rollup-extras/plugin-binify';
import externals from '@rollup-extras/plugin-externals';

// eslint-disable-next-line no-undef
console.log(process.env.CI);

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

    plugins: plugins
};