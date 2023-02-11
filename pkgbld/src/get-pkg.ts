
import fs from 'fs/promises';
import path from 'path';
import { Json } from './types';

export async function getPackage(): Promise<[string, Json]> {
    const pkgPath = path.resolve('package.json');
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, JSON.parse(buffer.toString())];
}