import fs from 'fs/promises';

export async function mv(from, to) {
    if (!from || !to) {
        return 'Usage: mv <from> <to>';
    }

    try {
        await fs.mkdir(to, { recursive: true });
        await fs.rename(from, to);
    } catch (e) {
        return e;
    }
}