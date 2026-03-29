import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {import('./types.js').CliOptions} CliOptions
 */

/**
 * @param {string[]} inputs
 * @param {CliOptions} config
 */
export async function createSubpackages(inputs, config) {
    for (const input of inputs) {
        const basename = path.basename(input, path.extname(input));
        if (basename !== 'index') {
            const pkg = {
                type: 'module',
                types: `../${config.dir}/${basename}.d.ts`,
                main: `../${config.dir}/${basename}.mjs`,
            };

            await fs.mkdir(basename, { recursive: true });
            await fs.writeFile(`${basename}/package.json`, JSON.stringify(pkg, null, 2));
        }
    }
}
