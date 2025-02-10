import fs from 'node:fs/promises';

export async function rm(path) {
    if (!path) {
        throw 'Usage: rm <path>';
    }

    try {
        await fs.rm(path, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
}