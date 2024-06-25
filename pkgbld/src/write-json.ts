import fs from 'fs/promises';
import { toFormattedJson } from 'options';
import { JsonObject } from 'type-fest';

export async function writeJson(path: string, json: JsonObject) {
    await fs.writeFile(path, toFormattedJson(json));
}