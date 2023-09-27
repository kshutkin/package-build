import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import clean from '@rollup-extras/plugin-clean';
import binify from '@rollup-extras/plugin-binify';
import externals from '@rollup-extras/plugin-externals';
import json from '@rollup/plugin-json';
import path from 'path';

const input = 'src/index.ts';

const dest = 'dist';

const plugins = [
    clean(),
    externals({
        // from our externals plugin
        external: (id, external, importer) => {
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
    }),
    resolve(),
    commonjs(),
    json(),
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