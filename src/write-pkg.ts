import fs from 'fs/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writePackage(pkgPath: string, pkg: any) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}