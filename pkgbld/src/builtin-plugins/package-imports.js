import fs from 'node:fs/promises';
import path from 'node:path';

import { Priority } from '../priorities.js';

/**
 * @typedef {import('../types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('../types.js').Provider} Provider
 */

/**
 * @param {Provider} provider
 * @param {BuildConfiguration} configuration
 */
export default function (provider, configuration) {
    if (!configuration.resolution.imports) return;

    provider.globalImport('node:fs/promises', 'fs');
    provider.globalImport('path', 'path');
    const createPlugin = /** @type {typeof createPackageImportsPlugin} */ (
        provider.globalSetup(createPackageImportsPlugin) ?? createPackageImportsPlugin
    );
    provider.provide(() => createPlugin(), Priority.packageImports);
}

/**
 * Keep the package's private specifiers for runtime resolution. Each importer
 * is assigned to its nearest real package boundary, so linked dependencies and
 * nested workspace packages retain ownership of their own private imports.
 */
export function createPackageImportsPlugin() {
    const packageRoot = fs.realpath(process.cwd());
    /** @type {Map<string, string | null>} */
    const owners = new Map();
    return {
        name: 'pkgbld:package-imports',
        /** @param {string} id @param {string | undefined} importer */
        async resolveId(id, importer) {
            if (!id.startsWith('#') || !importer || importer.includes('\0')) return null;
            let realImporter;
            try {
                realImporter = await fs.realpath(importer.split('?', 1)[0]);
            } catch (error) {
                if (['ENOENT', 'EINVAL'].includes(/** @type {NodeJS.ErrnoException} */ (error).code ?? '')) return null;
                throw error;
            }
            const owner = await findOwner(path.dirname(realImporter));
            return owner === (await packageRoot) ? { id, external: true } : null;
        },
    };

    /** @param {string} start */
    async function findOwner(start) {
        let directory = start;
        /** @type {string[]} */
        const visited = [];
        while (true) {
            if (owners.has(directory)) {
                const owner = /** @type {string | null} */ (owners.get(directory));
                for (const visitedDirectory of visited) owners.set(visitedDirectory, owner);
                return owner;
            }
            visited.push(directory);
            try {
                await fs.access(path.join(directory, 'package.json'));
                for (const visitedDirectory of visited) owners.set(visitedDirectory, directory);
                return directory;
            } catch (error) {
                if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
            }
            const parent = path.dirname(directory);
            if (parent === directory) {
                for (const visitedDirectory of visited) owners.set(visitedDirectory, null);
                return null;
            }
            directory = parent;
        }
    }
}
