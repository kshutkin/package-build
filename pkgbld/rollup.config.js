import rollupExtrasPluginClean from '@rollup-extras/plugin-clean';

import rollupPluginCommonjs from '@rollup/plugin-commonjs';

import rollupExtrasPluginExternals from '@rollup-extras/plugin-externals';

import rollupPluginNodeResolve from '@rollup/plugin-node-resolve';

import rollupPluginTypescript2 from 'rollup-plugin-typescript2';

import rollupExtrasPluginBinify from '@rollup-extras/plugin-binify';

const tmp_0 = rollupExtrasPluginClean(), config = {
    umdInputs: [],
    compressFormats: [ 'umd' ],
    sourcemapFormats: [ 'umd' ],
    formats: [ 'es', 'cjs' ],
    formatsOverriden: false,
    preprocess: [],
    dir: 'dist',
    sourceDir: 'src',
    bin: [ './dist/index.js' ],
    includeExternals: false,
    eject: true
};

export default [ {
    input: [ './src/index.ts' ],
    output: [ {
        format: 'es',
        dir: 'dist',
        entryFileNames: '[name].mjs',
        plugins: [ tmp_0 ],
        sourcemap: false,
        chunkFileNames: '[name].mjs'
    }, {
        format: 'cjs',
        dir: 'dist',
        entryFileNames: '[name].cjs',
        plugins: [ tmp_0.api.addInstance(), rollupExtrasPluginBinify({
            filter: item => 'chunk' === item.type && item.isEntry && config.bin.some((input => input === `./${config.dir}/${item.fileName}`))
        }) ],
        sourcemap: false,
        chunkFileNames: '[name].cjs'
    } ],
    plugins: [ rollupExtrasPluginExternals(), rollupPluginNodeResolve(), rollupPluginCommonjs(), rollupPluginTypescript2() ]
} ];