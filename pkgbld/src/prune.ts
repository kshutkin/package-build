import { Logger } from '@niceties/logger';
import { PackageJson } from 'options';
import { mkdir, readdir, rename, rm, stat } from 'fs/promises';
import path from 'path';
import { isExists } from './helpers';

export async function prunePkg(pkg: PackageJson, options: { kind: 'prune', profile: string, flatten: string | boolean }, logger: Logger) {
    const scriptsToKeep = getScriptsData();

    const keys = scriptsToKeep[options.profile];
    
    if (!keys) {
        throw new Error(`unknown profile ${options.profile}`);
    }

    delete pkg.devDependencies;
    delete (pkg as Record<string, string>)['packageManager'];

    if (pkg.scripts) {
        for (const key of Object.keys(pkg.scripts as Record<string, string>)) {
            if (!keys.has(key)) {
                delete (pkg.scripts as Record<string, string>)[key];
            }
        }

        if (Object.keys(pkg.scripts as Record<string, string>).length === 0) {
            delete pkg.scripts;
        }
    }

    if (options.flatten) {
        await flatten(pkg, options.flatten, logger);
    }

    if (pkg.files && Array.isArray(pkg.files)) {
        const filterFiles = ['package.json'];
        const specialFiles = ['README', 'LICENSE', 'LICENCE'];
        if (pkg.main && typeof pkg.main === 'string') {
            filterFiles.push(normalizePath(pkg.main));
        }
        if (pkg.bin) {
            if (typeof pkg.bin === 'string') {
                filterFiles.push(normalizePath(pkg.bin));
            }
            if (typeof pkg.bin === 'object' && pkg.bin !== null) {
                filterFiles.push(...Object.values(pkg.bin).map(normalizePath));
            }
        }
        pkg.files = pkg.files.filter(file => {            
            const fileNormalized = normalizePath(file);
            const dirname = path.dirname(fileNormalized);
            const basenameWithoutExtension = path.basename(fileNormalized, path.extname(fileNormalized)).toUpperCase();
            return !filterFiles.includes(fileNormalized) && (dirname !== '' && dirname !== '.' || !specialFiles.includes(basenameWithoutExtension));
        });
    }

    if (pkg.files && pkg.files.length === 0) {
        pkg.files = undefined;
    }
}

async function flatten(pkg: PackageJson, flatten: string | true, logger: Logger) {
    const { default: jsonata } = await import('jsonata');
    
    // find out where is the dist folder
    
    const expression = jsonata('[bin, bin.*, main, module, unpkg, umd, types, typings, exports[].*.*, typesVersions.*.*, directories.bin]');
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

    // create new directory structure
    const mkdirPromises = [] as Promise<void | string>[];
    for (const file of filesInDist) {
        // check file is not in root dir
        const relativePath = path.relative(relativeDistDir, file);
        mkdirPromises.push(mkdir(path.dirname(relativePath), { recursive: true }));
    }

    await Promise.all(mkdirPromises);
    
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
    
    let cleanedDir = relativeDistDir;
    while (isEmptyDir(cleanedDir)) {
        await rm(cleanedDir, { recursive: true, force: true });
        const parentDir = path.dirname(cleanedDir);
        if (parentDir === '.') {
            break;
        }
        cleanedDir = parentDir;
    }

    const normalizedCleanDir = normalizePath(cleanedDir);
    
    const allReferencesSet = new Set(allReferences);
    
    // update package.json
    const stringToReplace = distDir + '/'; // we append / to remove in from the middle of the string
    const pkgClone = cloneAndUpdate(pkg, value => allReferencesSet.has(value) ? value.replace(stringToReplace, '') : value);
    Object.assign(pkg, pkgClone);
    
    // update files
    let files = pkg.files;
    if (files) {
        files = files.filter(file => {
            const fileNormalized = normalizePath(file);
            return !isSubDirectory(cleanedDir, fileNormalized) && fileNormalized !== normalizedCleanDir;
        });
        files.push(...newFiles);
        pkg.files = [...files];
    }
    
    // remove extra directories with package.json
    const exports = pkg.exports ? Object.keys(pkg.exports) : [];
    for (const key of exports) {
        if (key === '.') {
            continue;
        }
        const isDir = await isDirectory(key);
        if (isDir) {
            const pkgPath = path.join(key, 'package.json');
            const pkgExists = await isExists(pkgPath);
            // ensure nothing else is in the directory
            const files = await readdir(key);
            if (files.length === 1 && pkgExists) {
                await rm(key, { recursive: true, force: true });
            }
        }
    }
}

function normalizePath(file: string) {
    let fileNormalized = path.normalize(file);
    if (fileNormalized.endsWith('/') || fileNormalized.endsWith('\\')) {
        // remove trailing slash
        fileNormalized = fileNormalized.slice(0, -1);
    }
    return fileNormalized;
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

function isSubDirectory(parent: string, child: string) {
    return path.relative(child, parent).startsWith('..');
}

async function isEmptyDir(dir: string) {
    const entries = await readdir(dir);
    return entries.length === 0;
}

async function isDirectory(file: string) {
    const fileStat = await stat(file);
    return fileStat.isDirectory();
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