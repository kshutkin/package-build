import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isExists } from './helpers.js';

/**
 * @typedef {import('@niceties/logger').Logger} Logger
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('type-fest').JsonValue} JsonValue
 * @typedef {import('type-fest').PackageJson} PackageJson
 */

/**
 * @param {PackageJson} pkg
 * @param {{ kind: 'prune'; profile: string; flatten: string | boolean; removeSourcemaps: boolean; optimizeFiles: boolean }} options
 * @param {Logger} logger
 */
export async function prunePkg(pkg, options, logger) {
    const scriptsToKeep = getScriptsData();

    const keys = scriptsToKeep[options.profile];

    if (!keys) {
        throw new Error(`unknown profile ${options.profile}`);
    }

    pkg.devDependencies = undefined;
    /** @type {Record<string, string | undefined>} */ (pkg).packageManager = undefined;

    if (pkg.scripts) {
        for (const key of Object.keys(/** @type {Record<string, string>} */ (pkg.scripts))) {
            if (!keys.has(key)) {
                delete (/** @type {Record<string, string>} */ (pkg.scripts)[key]);
            }
        }

        if (Object.keys(/** @type {Record<string, string>} */ (pkg.scripts)).length === 0) {
            pkg.scripts = undefined;
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
                filterFiles.push(...Object.values(pkg.bin).map(/** @type {(value: string | undefined) => string} */ (normalizePath)));
            }
        }

        /** @type {Map<number, string[]>} */
        const depthToFiles = new Map();

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
            const files = /** @type {string[]} */ (depthToFiles.get(depth));
            /** @type {Map<string, string[]>} */
            const mapDirToFiles = new Map();
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
                    } else {
                        /** @type {string[]} */ (depthToFiles.get(depth - 1)).push(dirname);
                    }
                    const thisDepth = /** @type {string[]} */ (depthToFiles.get(depth));
                    depthToFiles.set(
                        depth,
                        thisDepth.filter(file => filesInDir.every(fileInDir => path.join(dirname, fileInDir) !== file))
                    );
                }
            }
        }

        pkg.files = [...new Set(Array.from(depthToFiles.values()).flat())];

        pkg.files = pkg.files.filter(file => {
            const fileNormalized = normalizePath(file);
            const dirname = path.dirname(fileNormalized);
            const basenameWithoutExtension = path.basename(fileNormalized, path.extname(fileNormalized)).toUpperCase();
            return (
                !filterFiles.includes(fileNormalized) &&
                ((dirname !== '' && dirname !== '.') || !specialFiles.includes(basenameWithoutExtension))
            );
        });

        /** @type {string[]} */
        const ignoreDirs = [];

        for (const fileOrDir of pkg.files) {
            if (await isDirectory(fileOrDir)) {
                const allFiles = await walkDir(fileOrDir);
                if (
                    allFiles.every(file => {
                        const fileNormalized = normalizePath(file);
                        return filterFiles.includes(fileNormalized);
                    })
                ) {
                    ignoreDirs.push(fileOrDir);
                }
            }
        }

        pkg.files = pkg.files.filter(dir => !ignoreDirs.includes(dir));

        if (pkg.files.length === 0) {
            pkg.files = undefined;
        }
    }
}

/**
 * @param {PackageJson} pkg
 * @param {string | true} flatten
 * @param {Logger} logger
 */
async function flatten(pkg, flatten, logger) {
    const { default: jsonata } = await import('jsonata');

    // find out where is the dist folder

    const expression = jsonata('[bin, bin.*, main, module, unpkg, umd, types, typings, exports[].*.*, typesVersions.*.*, directories.bin]');
    const allReferences = /** @type {string[]} */ (await expression.evaluate(pkg));
    /** @type {string | undefined} */
    let distDir;

    // at this point we requested directories.bin, but it is the only one that is directory and not a file
    // later when we get dirname we can't flatten directories.bin completely
    // it is easy to fix by checking element is a directory but it is kind of good
    // to have it as a separate directory, but user still can flatten it by specifying the directory

    if (flatten === true) {
        /** @type {string[] | undefined} */
        let commonSegments;

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

    const relativeDistDir = `./${distDir}`;

    /** @type {Promise<string | false>[]} */
    const existsPromises = [];

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

    if (
        typeof flatten === 'string' &&
        'directories' in pkg &&
        pkg.directories != null &&
        typeof pkg.directories === 'object' &&
        'bin' in pkg.directories &&
        typeof pkg.directories.bin === 'string' &&
        normalizePath(pkg.directories.bin) === normalizePath(flatten)
    ) {
        delete pkg.directories.bin;
        if (Object.keys(pkg.directories).length === 0) {
            pkg.directories = undefined;
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
    /** @type {Promise<undefined | string>[]} */
    const mkdirPromises = [];
    for (const file of filesInDist) {
        // check file is not in root dir
        const relativePath = path.relative(relativeDistDir, file);
        mkdirPromises.push(mkdir(path.dirname(relativePath), { recursive: true }));
    }

    await Promise.all(mkdirPromises);

    // move files to root dir (rename)
    /** @type {Promise<void>[]} */
    const renamePromises = [];
    /** @type {string[]} */
    const newFiles = [];

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
    const stringToReplace = `${distDir}/`; // we append / to remove in from the middle of the string
    const pkgClone = cloneAndUpdate(pkg, value => (allReferencesSet.has(value) ? value.replace(stringToReplace, '') : value));
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

/**
 * @param {string} file
 * @returns {string}
 */
function normalizePath(file) {
    let fileNormalized = path.normalize(file);
    if (fileNormalized.endsWith('/') || fileNormalized.endsWith('\\')) {
        // remove trailing slash
        fileNormalized = fileNormalized.slice(0, -1);
    }
    return fileNormalized;
}

/**
 * @template {JsonValue} T
 * @param {T} pkg
 * @param {(value: string) => string} updater
 * @returns {T}
 */
function cloneAndUpdate(pkg, updater) {
    if (typeof pkg === 'string') {
        return /** @type {T} */ (updater(pkg));
    }
    if (Array.isArray(pkg)) {
        return /** @type {T} */ (pkg.map(value => cloneAndUpdate(value, updater)));
    }
    if (typeof pkg === 'object' && pkg !== null) {
        /** @type {Record<string, JsonValue>} */
        const clone = {};
        for (const key of Object.keys(pkg)) {
            clone[key] = cloneAndUpdate(/** @type {JsonValue} */ (/** @type {JsonObject} */ (pkg)[key]), updater);
        }
        return /** @type {T} */ (clone);
    }
    return pkg;
}

/**
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function isSubDirectory(parent, child) {
    return path.relative(child, parent).startsWith('..');
}

/**
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
async function isEmptyDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(entry => !entry.isDirectory()).length === 0;
}

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
async function isDirectory(file) {
    const fileStat = await stat(file);
    return fileStat.isDirectory();
}

/**
 * @param {string} dir
 * @param {string[]} [ignoreDirs]
 * @returns {Promise<string[]>}
 */
async function walkDir(dir, ignoreDirs = []) {
    const entries = await readdir(dir, { withFileTypes: true });
    /** @type {string[]} */
    const files = [];
    await Promise.all(
        entries
            .map(entry => {
                const childPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !ignoreDirs.includes(entry.name)) {
                    return walkDir(childPath).then(childFiles => {
                        files.push(...childFiles);
                    });
                }
                files.push(childPath);
            })
            .filter(Boolean)
    );
    return files;
}

/**
 * @returns {Record<string, Set<string>>}
 */
function getScriptsData() {
    const libraryScripts = new Set(['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']);

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
        'posttest',
    ]);

    return {
        library: libraryScripts,
        app: appScripts,
    };
}
