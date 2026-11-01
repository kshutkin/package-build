import fs from 'node:fs/promises';

import { isJsoncFile, toFormattedJsonc } from './json.js';
import { toFormattedJson } from './options/index.js';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 */

/**
 * @param {string} path
 * @param {JsonObject} json
 */
export async function writeJson(path, json) {
    let current;
    try {
        current = await fs.readFile(path, 'utf8');
    } catch (/** @type {any} */ error) {
        if (error.code !== 'ENOENT') throw error;
    }
    await fs.writeFile(path, isJsoncFile(path) ? toFormattedJsonc(json, current) : toFormattedJson(json, current));
}
