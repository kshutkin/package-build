import fs from 'fs/promises';

export async function cleanupDir(dir: string) {
    try {
        await fs.rm(dir, { recursive: true });
    } catch(e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((e as any)['code'] !== 'ENOENT') {
            throw e;
        }
    }
}