import rollupPluginTypescript2 from 'rollup-plugin-typescript2';

import rollupPluginNodeResolve from '@rollup/plugin-node-resolve';

import rollupPluginCommonjs from '@rollup/plugin-commonjs';

import rollupExtrasPluginClean from '@rollup-extras/plugin-clean';

import rollupExtrasPluginExternals from '@rollup-extras/plugin-externals';

import path from 'path';

const tmp_0 = rollupExtrasPluginClean(), config = {
    umdInputs: [],
    compressFormats: [ 'umd' ],
    sourcemapFormats: [ 'umd' ],
    formats: [ 'es', 'cjs' ],
    formatsOverridden: false,
    preprocess: [],
    dir: 'dist',
    sourceDir: 'src',
    bin: void 0,
    includeExternals: false,
    eject: true,
    noTsConfig: false,
    noUpdatePackageJson: false,
    commonjsPattern: '[name].cjs',
    esPattern: '[name].mjs',
    umdPattern: '[name].umd.js'
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
        plugins: [ tmp_0.api.addInstance() ],
        sourcemap: false,
        chunkFileNames: '[name].cjs'
    } ],
    plugins: [ rollupExtrasPluginExternals({
        external: (id, external, importer) => function(importer, external, id, config) {
            if (false === config.includeExternals) return external;
            if (!external) return false;
            path.isAbsolute(id) && (id = path.relative(path.join(process.cwd(), '..'), id));
            const internals = config.includeExternals;
            if (internals.includes(id) || internals.some((internal => id.startsWith(internal)))) return false;
            const relative = path.relative('.', path.resolve(importer ?? '.', id));
            return !internals.some((internal => relative.includes(`node_modules/${internal}/`)));
        }(importer, external, id, config)
    }), rollupPluginNodeResolve(), rollupPluginCommonjs(), rollupPluginTypescript2() ]
} ];