import fs from 'fs/promises';
import { Json } from './types';
import { toFormattedJson } from 'options';

export async function writeJson(path: string, json: Json) {
    await fs.writeFile(path, toFormattedJson(json));
}