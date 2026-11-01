import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findTsconfig, parseTsconfig } from 'get-tsconfig';

import { parseJson } from './json.js';

/**
 * Find the nearest TypeScript or JavaScript config, preferring TypeScript at the same depth.
 * Resolve inherited settings while leaving the authored files unchanged.
 */
export function getProjectTsConfig() {
    const candidates = [findTsconfig(), findTsconfig(process.cwd(), 'jsconfig.json')]
        .filter((/** @type {string | undefined} */ candidate) => candidate !== undefined)
        .sort((left, right) => path.dirname(right).length - path.dirname(left).length);
    const configPath = candidates[0];
    if (!configPath) return null;
    // Reject invalid authored JSONC instead of accepting a partially parsed config.
    parseJson(readFileSync(configPath, 'utf8'), true);
    return { path: configPath, config: parseTsconfig(configPath) };
}
