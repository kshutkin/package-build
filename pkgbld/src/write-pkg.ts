import fs from 'fs/promises';
import { Json } from './types';

export async function writePackage(pkgPath: string, pkg: Json) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}