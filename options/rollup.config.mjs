import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import clean from '@rollup-extras/plugin-clean';
import externals from '@rollup-extras/plugin-externals';

export default [ {
    input: [ './src/index.ts' ],
    output: {
        format: 'es',
        dir: 'dist',
        entryFileNames: '[name].mjs',
        plugins: [ clean() ],
        chunkFileNames: '[name].mjs'
    },
    plugins: [ externals(), resolve(), commonjs(), typescript() ]
} ];