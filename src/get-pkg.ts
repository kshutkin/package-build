import fs from 'fs/promises';
import path from 'path';

export async function getPackage() {
    const pkgPath = path.resolve('package.json');
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, JSON.parse(buffer.toString())];
}