import fs from 'fs/promises';

export function ln(existingPath, newPath) {
    if (!existingPath || !newPath) {
        return 'Usage: ln <existingPath> <newPath>';
    }

    return fs.link(existingPath, newPath);
}