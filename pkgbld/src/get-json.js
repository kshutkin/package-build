import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 */

/**
 * @param {string} fileName
 * @returns {Promise<[string, JsonObject]>}
 */
export async function getJson(fileName) {
    const pkgPath = path.resolve(fileName);
    const buffer = await fs.readFile(pkgPath);
    return [pkgPath, /** @type {JsonObject} */ (JSON.parse(buffer.toString()))];
}
