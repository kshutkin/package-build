import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import preprocess from 'rollup-plugin-preprocess';
import clean from '@rollup-extras/plugin-clean';
import externals from '@rollup-extras/plugin-externals';
import replace from '@rollup/plugin-replace';
import path from 'node:path';
import kleur from 'kleur';

const input = 'src/index.js';

const dest = 'dist';

const reported = new Set;

const plugins = [
    clean(),
    replace({
        delimiters: ['', ''],
        '#!/usr/bin/env node': '',
        'process.env.PKGBLD_INTERNAL': 'true'
    }),
    externals({
        external: (id, external, importer) => {
            const internals = ['pkgbld', '@rollup-extras', '@niceties', '@slimlib'];
            if (internals.includes(id) || internals.some(internal => id.startsWith(internal))) {
                console.log('inlining', kleur.cyan(id));
                return false;
            }
            const relative = path.relative('.', path.resolve(importer ?? '.', id));
            if (relative === '../pkgbld/dist/index.mjs') {
                console.log('inlining', kleur.cyan(relative));
                return false;
            }
            if (internals.some(internal => relative.includes(`node_modules/${internal}/`))) {
                if (!reported.has(relative)) {
                    console.log('inlining', kleur.cyan(relative));
                    reported.add(relative);
                }
                return false;
            }
            return external;
        }
    }),
    resolve({
        exportConditions: ['default', 'require']
    }),
    commonjs()
];

export default {
    input,

    output: {
        format: 'esm',
        dir: dest,
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name].[hash].mjs',
    },

    plugins: [preprocess.default({ include: [ 'src/index.ts' ], context: { esm: true } }), ...plugins]
};