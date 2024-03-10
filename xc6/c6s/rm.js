import fs from 'fs/promises';

export async function rm(path) {
    if (!path) {
        return 'Usage: rm <path>';
    }

    try {
        await fs.rm(path, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            return e;
        }
    }
}