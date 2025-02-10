import fs from 'node:fs/promises';

export async function ln(existingPath, newPath) {
    if (!existingPath || !newPath) {
        throw 'Usage: ln <existingPath> <newPath>';
    }

    const stat = await fs.stat(existingPath);
    if (stat.isFile()) {
        await fs.link(existingPath, newPath);
    } else {
        await fs.symlink(existingPath, newPath, 'dir');
    }
}