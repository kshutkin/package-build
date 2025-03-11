import path, { dirname, join } from 'node:path';
import camelCase from 'lodash/camelCase.js';
import type { OutputOptions } from 'rollup';
import kleur from 'kleur';
import { processPackageJson, type PackageJson as PackageJsonO } from 'options';
import { access, constants, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PackageJson } from 'type-fest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getHelpers(pkgName: string) {
    function getGlobalName(anInput: string) {
        return camelCase(path.join(pkgName, path.basename(anInput, path.extname(anInput)) !== 'index' ? path.basename(anInput, path.extname(anInput)) : ''));
    }

    function getExternalGlobalName(id: string) {
        if (path.isAbsolute(id)) {
            return getGlobalName(path.relative(__dirname, id));
        }
        return camelCase(id);
    }

    return {
        getGlobalName,
        getExternalGlobalName
    };
}

export function toArray<T>(object: T | T[] | undefined) {
    if (Array.isArray(object)) {
        return object;
    }
    if (object == null) {
        return [];
    }
    return [object];
}

export function formatInput(input: string[] | string): string {
    return (Array.isArray(input) ? input : [input ?? '']).map(item => kleur.magenta(path.basename(item, path.extname(item)))).join(', ');
}

export function formatOutput(output: OutputOptions | OutputOptions[] | undefined, field: 'dir' | 'format'): string {
    //? can we avoid it
    if (output == null) {
        return '';
    }
    return (Array.isArray(output) ? output : [output ?? '']).map(item => kleur.cyan(item[field] as string)).join(', ');
}

export function getTimeDiff(starting: number) {
    const diff = Date.now() - starting;
    return diff >= 1000 ? `${(diff / 1000).toFixed(1)}s` : `${diff}ms`;
}

export const areSetsEqual = <T>(a: Set<T>, b: Set<T>) => a.size === b.size ? [...a].every(value => b.has(value)) : false;

export function formatPackageJson(pkg: PackageJson) {
    return processPackageJson(pkg as PackageJsonO, key => key in pkg, key => (pkg as Record<string, unknown>)[key]) as PackageJson;
}

export async function isExists(file: string) {
    try {
        await access(file);
    } catch (e: unknown) {
        if (typeof e === 'object' && e != null && 'code' in e && e.code === 'ENOENT') {
            return false as const;
        }
        throw e;
    }
    return file;
}

// it is borrowed from vite logic, basically the same but simplified
// without recursion and fully async
export async function isReadable(file: string) {
    try {
        await stat(file);
    } catch {
        return false;
    }
    try {
        await access(file, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function hasFile(root: string, file: string) {
    const path = join(root, file);
    return isExists(path);
}

async function hasWorkspacePackageJson(root: string) {
    const path = join(root, 'package.json');
    if (!await isReadable(path)) {
        return false;
    }
    try {
        const content = (JSON.parse(await readFile(path, 'utf-8')) || {}) as PackageJson;
        return !!content.workspaces;
    } catch {
        return false;
    }
}

export async function searchForPackageRoot(current: string) {
    const root = current;
    let dir = current;

    while (dir) {
        if (await hasFile(dir, 'package.json')) return dir;

        const parentDir = dirname(dir);
        if (parentDir === dir) break; // Reached the filesystem root

        dir = parentDir;
    }

    return root;
}

export async function searchForWorkspaceRoot(current: string) {
    const root = await searchForPackageRoot(current);
    let dir = current;

    while (dir) {
        if (await hasFile(dir, 'pnpm-workspace.yaml')) return dir;
        if (await hasWorkspacePackageJson(dir)) return dir;

        const parentDir = dirname(dir);
        if (parentDir === dir) break; // Reached the filesystem root

        dir = parentDir;
    }

    return root;
}