// @ts-check
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import clean from '@rollup-extras/plugin-clean';
import externals from '@rollup-extras/plugin-externals';
import json from '@rollup/plugin-json';
// import dts from 'rollup-plugin-dts';
import path from 'path';
import process from 'process';

const input = 'src/index.ts';

const dest = 'dist';

const plugins = [
    clean(),
    externals({ external }),
    resolve(),
    commonjs(),
    json(),
    typescript()
];

/**
 * @type {import('rollup').RollupOptions[]}
  */
export default [{
    input,

    output: {
        format: 'esm',
        dir: dest,
        entryFileNames: '[name].mjs'
    },

    plugins: plugins
// }, {
//     input: './dist/src/index.d.ts',
//     output: [{ file: 'dist/index.d.ts', format: 'es' }],
//     plugins: [dts(), externals({ external })],
}];

function external(id, external, importer) {
    const internals = ['options'];
    if (!external) return false;
    if (path.isAbsolute(id)) {
        id = path.relative(path.join(process.cwd(), '..'), id);
    }
    if (internals.includes(id) || internals.some(internal => id.startsWith(internal))) {
        return false;
    }
    const relative = path.relative('.', path.resolve(importer ?? '.', id));
    if (internals.some(internal => relative.includes(`node_modules/${internal}/`))) {
        return false;
    }
    return true;
}