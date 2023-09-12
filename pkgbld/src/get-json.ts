import fs from 'fs/promises';
import path from 'path';
import { Json } from './types';

export async function getJson(fileName: string): Promise<[string, Json]> {
    const pkgPath = path.resolve(fileName);
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, JSON.parse(buffer.toString()) as Json];
}