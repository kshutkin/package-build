import fs from 'fs/promises';
import { Json } from './types';

export async function writeJson(path: string, json: Json) {
    await fs.writeFile(path, JSON.stringify(json, null, 2) + '\n');
}