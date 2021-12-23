import fs from 'fs/promises';
import path from 'path';
import { getCliOptions } from './get-cli-options';

export async function createSubpackages(inputs: string[], config: ReturnType<typeof getCliOptions>) {
    for (const input of inputs) {
        const basename = path.basename(input, '.ts');
        if (basename !== 'index') {
            const pkg = {
                types: `../${config.dir}/${basename}.d.ts`
            };

            await fs.mkdir(basename, { recursive: true });
            await fs.writeFile(`${basename}/package.json`, JSON.stringify(pkg, null, 2));
        }
    }
}