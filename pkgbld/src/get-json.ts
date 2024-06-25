import fs from 'fs/promises';
import path from 'path';
import { JsonObject } from 'type-fest';

export async function getJson(fileName: string): Promise<[string, JsonObject]> {
    const pkgPath = path.resolve(fileName);
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, JSON.parse(buffer.toString()) as JsonObject];
}