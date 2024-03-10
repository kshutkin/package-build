import fs from 'fs/promises';

export function cp(src, dest) {
    if (!path) {
        return 'Usage: cp <src> <dest>';
    }

    return fs.cp(src, dest, { recursive: true });
}