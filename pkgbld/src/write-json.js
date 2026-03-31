import fs from 'node:fs/promises';

import { toFormattedJson } from './options/index.js';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 */

/**
 * @param {string} path
 * @param {JsonObject} json
 */
export async function writeJson(path, json) {
    await fs.writeFile(path, toFormattedJson(json));
}
