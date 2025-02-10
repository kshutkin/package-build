import fs from 'node:fs/promises';

export async function mv(from, to) {
    if (!from || !to) {
        throw 'Usage: mv <from> <to>';
    }

    await fs.mkdir(to, { recursive: true });
    await fs.rename(from, to);
}