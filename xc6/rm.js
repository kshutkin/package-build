import fs from 'fs/promises';

/**
 * @param {string} dst - The path to the file or directory to remove.
 */
export default async function rm(dst) {
    try {
        await fs.rm(dst, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(e);
        }        
    }
}