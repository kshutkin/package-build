import fs from 'fs/promises';

export function cp(src, dest) {
    if (!src || !dest) {
        return 'Usage: cp <src> <dest>';
    }

    return fs.cp(src, dest, { recursive: true });
}