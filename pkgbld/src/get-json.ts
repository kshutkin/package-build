import fs from 'node:fs/promises';
import path from 'node:path';
import type { JsonObject } from 'type-fest';

export async function getJson(fileName: string): Promise<[string, JsonObject]> {
    const pkgPath = path.resolve(fileName);
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, JSON.parse(buffer.toString()) as JsonObject];
}