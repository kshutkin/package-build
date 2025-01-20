import { Logger } from '@niceties/logger';
import { JsonObject, JsonValue, PackageJson } from 'type-fest';
import { mkdir, readdir, rename, rm, stat, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { isExists } from './helpers';

export async function prunePkg(pkg: PackageJson, options: { kind: 'prune', profile: string, flatten: string | boolean, removeSourcemaps: boolean, optimizeFiles: boolean }, logger: Logger) {
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

    if (options.removeSourcemaps) {
        const sourceMaps = await walkDir('.', ['node_modules']).then(files => files.filter(file => file.endsWith('.map')));
        for (const sourceMap of sourceMaps) {
            // find corresponding file
            const sourceFile = sourceMap.slice(0, -4);
            // load file
            const sourceFileContent = await readFile(sourceFile, 'utf8');
            // find sourceMappingURL
            const sourceMappingUrl = `\n//# sourceMappingURL=${path.basename(sourceMap)}`;
            // remove sourceMappingURL
            const newContent = sourceFileContent.replace(sourceMappingUrl, '');
            // write file
            await writeFile(sourceFile, newContent, 'utf8');
            // remove sourceMap
            await rm(sourceMap);
        }
    }

    if (pkg.files && Array.isArray(pkg.files) && options.optimizeFiles) {
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

        const depthToFiles = new Map<number, string[]>();

        for (const file of pkg.files.concat(filterFiles)) {
            const dirname = path.dirname(file);
            const depth = dirname.split('/').length;
            if (!depthToFiles.has(depth)) {
                depthToFiles.set(depth, [file]);
            } else {
                depthToFiles.get(depth)?.push(file);
            }
        }

        // walk depth keys from the highest to the lowest
        const maxDepth = Math.max(...depthToFiles.keys());
        for (let depth = maxDepth; depth > 0; --depth) {
            const files = depthToFiles.get(depth) as string[];
            const mapDirToFiles = new Map<string, string[]>();
            for (const file of files) {
                const dirname = path.dirname(file);
                const basename = normalizePath(path.basename(file));
                if (!mapDirToFiles.has(dirname)) {
                    mapDirToFiles.set(dirname, [basename]);
                } else {
                    mapDirToFiles.get(dirname)?.push(basename);
                }
            }
            for (const [dirname, filesInDir] of mapDirToFiles) {
                // find out real content of the directory
                const realFiles = await readdir(dirname);
                // check if all files in the directory are in the filesInDir
                const allFilesInDir = realFiles.every(file => filesInDir.includes(file)) || realFiles.length === 0;
                if (allFilesInDir && dirname !== '.') {
                    if (!depthToFiles.has(depth - 1)) {
                        depthToFiles.set(depth - 1, [dirname]);
                    }  else {
                        (depthToFiles.get(depth - 1) as string[]).push(dirname);
                    }
                    const thisDepth = depthToFiles.get(depth) as string[];
                    depthToFiles.set(depth, thisDepth.filter(file => filesInDir.every(fileInDir => path.join(dirname, fileInDir) !== file)));
                }
            }
        }

        pkg.files = [...new Set(Array.from(depthToFiles.values()).flat())];

        pkg.files = pkg.files.filter(file => {            
            const fileNormalized = normalizePath(file);
            const dirname = path.dirname(fileNormalized);
            const basenameWithoutExtension = path.basename(fileNormalized, path.extname(fileNormalized)).toUpperCase();
            return !filterFiles.includes(fileNormalized) && (dirname !== '' && dirname !== '.' || !specialFiles.includes(basenameWithoutExtension));
        });

        const ignoreDirs: string[] = [];

        for (const fileOrDir of pkg.files) {
            if (await isDirectory(fileOrDir)) {
                const allFiles = await walkDir(fileOrDir);
                if (allFiles.every(file => {
                    const fileNormalized = normalizePath(file);
                    return filterFiles.includes(fileNormalized);
                })) {
                    ignoreDirs.push(fileOrDir);
                }
            }
        }

        pkg.files = pkg.files.filter(dir => !ignoreDirs.includes(dir));

        if (pkg.files.length === 0) {
            delete pkg.files;
        }
    }    
}

async function flatten(pkg: PackageJson, flatten: string | true, logger: Logger) {
    const { default: jsonata } = await import('jsonata');
    
    // find out where is the dist folder
    
    const expression = jsonata('[bin, bin.*, main, module, unpkg, umd, types, typings, exports[].*.*, typesVersions.*.*, directories.bin]');
    const allReferences = (await expression.evaluate(pkg)) as string[];
    let distDir: string | undefined;

    // at this point we requested directories.bin, but it is the only one that is directory and not a file
    // later when we get dirname we can't flatten directories.bin completely
    // it is easy to fix by checking element is a directory but it is kind of good
    // to have it as a separate directory, but user still can flatten it by specifying the directory
    
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
        distDir = normalizePath(flatten);
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

    if (typeof flatten === 'string' && 'directories' in pkg && pkg.directories != null
        && typeof pkg.directories === 'object' && 'bin' in pkg.directories
        && typeof pkg.directories.bin === 'string' && normalizePath(pkg.directories.bin) === normalizePath(flatten)) {
        delete pkg.directories.bin;
        if (Object.keys(pkg.directories).length === 0) {
            delete pkg.directories;
        }
        const files = await readdir(flatten);
        if (files.length === 1) {
            pkg.bin = files[0];
        } else {
            pkg.bin = {};
            for (const file of files) {
                pkg.bin[path.basename(file, path.extname(file))] = file;
            }
        }
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
    while (await isEmptyDir(cleanedDir)) {
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

function normalizePath(file?: string) {
    let fileNormalized = path.normalize(file!);
    if (fileNormalized.endsWith('/') || fileNormalized.endsWith('\\')) {
        // remove trailing slash
        fileNormalized = fileNormalized.slice(0, -1);
    }
    return fileNormalized;
}

function cloneAndUpdate<T extends JsonValue>(pkg: T, updater: (value: string) => string): T {
    if (typeof pkg === 'string') {
        return updater(pkg) as T;
    }
    if (Array.isArray(pkg)) {
        return pkg.map(value => cloneAndUpdate(value, updater)) as T;
    }
    if (typeof pkg === 'object' && pkg !== null) {
        const clone = {} as Record<string, JsonValue>;
        for (const key of Object.keys(pkg)) {
            clone[key] = cloneAndUpdate((pkg as JsonObject)[key] as JsonValue, updater);
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

async function walkDir(dir: string, ignoreDirs: string[] = []) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [] as string[];
    await Promise.all(entries.map(entry => {
        const childPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !ignoreDirs.includes(entry.name)) {
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