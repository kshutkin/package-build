import { Logger } from '@niceties/logger';
import { PackageJson } from 'options';
import { readdir, access, rename, rm } from 'fs/promises';
import path from 'path';

export async function prunePkg(pkg: PackageJson, options: { kind: 'prune', profile: string, flatten: string | boolean }, logger: Logger) {
    if (options.kind !== 'prune') {
        throw new Error('prunePkg should only be called in prune mode');
    }

    const scriptsToKeep = getScriptsData();

    const keys = scriptsToKeep[options.profile];
    
    if (!keys) {
        throw new Error(`unknown profile ${options.profile}`);
    }

    delete pkg.devDependencies;

    for (const key of Object.keys(pkg.scripts as Record<string, string>)) {
        if (!keys.has(key)) {
            delete (pkg.scripts as Record<string, string>)[key];
        }
    }

    if (Object.keys(pkg.scripts as Record<string, string>).length === 0) {
        delete pkg.scripts;
    }

    if (options.flatten) {
        await flatten(pkg, options.flatten, logger);
    }
}

async function flatten(pkg: PackageJson, flatten: string | true, logger: Logger) {
    const { default: jsonata } = await import('jsonata');

    // find out where is the dist folder

    const expression = jsonata('[bin, main, module, unpkg, umd, types, typings, exports[].*.*, typesVersions.*.*]');
    const allReferences = (await expression.evaluate(pkg)) as string[];
    let distDir: string | undefined;

    if (flatten === true) {
        let commonSegments: string[] | undefined;

        for (const entry of allReferences) {
            if (typeof entry !== 'string') {
                continue;
            }

            const dirname = path.dirname(entry);

            const cleanedSegments = dirname.split('/').filter(path => path && path !== '.');
            if (!commonSegments) {
                commonSegments = cleanedSegments;
            } else {
                for (let i = 0; i < commonSegments.length; ++i) {
                    if (commonSegments[i] !== cleanedSegments[i]) {
                        commonSegments.length = i;
                        break;
                    }
                }
            }
        }
        distDir = commonSegments?.join('/');
    } else {
        distDir = flatten;
    }    

    if (!distDir) {
        throw new Error('could not find dist folder');
    }

    logger.update(`flattening ${distDir}...`);

    // check if dist can be flattened

    const relativeDistDir = './' + distDir;

    const existsPromises = [] as Promise<string | false>[];

    const filesInDist = await walkDir(relativeDistDir);

    for (const file of filesInDist) {
        // check file is not in root dir
        const relativePath = path.relative(relativeDistDir, file);
        existsPromises.push(isExists(relativePath));
    }

    const exists = await Promise.all(existsPromises);

    const filesAlreadyExist = exists.filter(Boolean);
    
    if (filesAlreadyExist.length) {
        throw new Error(`dist folder cannot be flattened because files already exist: ${filesAlreadyExist.join(', ')}`);
    }

    // move files to root dir (rename)
    const renamePromises = [] as Promise<void>[];
    const newFiles = [] as string[];

    for (const file of filesInDist) {
        // check file is not in root dir
        const relativePath = path.relative(relativeDistDir, file);
        newFiles.push(relativePath);
        renamePromises.push(rename(file, relativePath));
    }

    await Promise.all(renamePromises);

    // remove dist folder
    try {
        await rm(relativeDistDir, { recursive: true, force: true });
    } catch (e: unknown) {
        // ignore
    }

    const allReferencesSet = new Set(allReferences);

    // update package.json
    const stringToReplace = distDir + '/';
    const pkgClone = cloneAndUpdate(pkg, value => allReferencesSet.has(value) ? value.replace(stringToReplace, '') : value);
    Object.assign(pkg, pkgClone);

    // update files
    let files = pkg.files ?? [];
    files = files.filter(file => {
        let fileNormilized = path.normalize(file);
        if (fileNormilized.endsWith('/')) {
            // remove trailing slash
            fileNormilized = fileNormilized.slice(0, -1);
        }
        return fileNormilized !== distDir as string;
    });
    files.push(...newFiles);
    pkg.files = [...files];
}

type JSONValue =
    | string
    | number
    | boolean
    | null
    | { [x: string]: JSONValue }
    | Array<JSONValue>;

function cloneAndUpdate<T extends JSONValue>(pkg: T, updater: (value: string) => string): T {
    if (typeof pkg === 'string') {
        return updater(pkg) as T;
    }
    if (Array.isArray(pkg)) {
        return pkg.map(value => cloneAndUpdate(value, updater)) as T;
    }
    if (typeof pkg === 'object' && pkg !== null) {
        const clone = {} as Record<string, JSONValue>;
        for (const key of Object.keys(pkg)) {
            clone[key] = cloneAndUpdate(pkg[key] as JSONValue, updater);
        }
        return clone as T;
    }
    return pkg;
}

async function isExists(file: string) {
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

async function walkDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [] as string[];
    await Promise.all(entries.map(entry => {
        const childPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return walkDir(childPath)
                .then(childFiles => {
                    files.push(...childFiles);
                });
        } else {
            files.push(childPath);
        }
    }).filter(Boolean));
    return files;
}

function getScriptsData() {
    const libraryScripts = new Set([
        'preinstall',
        'install',
        'postinstall',
        'prepublish',
        'preprepare',
        'prepare',
        'postprepare'
    ]);
    
    const appScripts = new Set([
        ...libraryScripts,
        'prestart',
        'start',
        'poststart',
        'prerestart',
        'restart',
        'postrestart',
        'prestop',
        'stop',
        'poststop',
        'pretest',
        'test',
        'posttest'
    ]);
    
    return {
        library: libraryScripts,
        app: appScripts
    } as Record<string, Set<string>>;
}