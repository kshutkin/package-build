import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Converts a string to real files and directories in the file system.
 * @param {string} data 
 * @param {string} baseDir
 */
export async function stringToFiles(data, baseDir) {
    /**
     * @type {string[]}
     */
    const directoriesStack = [];
    let prevString = '';
    let depth = 0;
    /**
     * @type {string | undefined}
     */
    let content = undefined;
    for (const line of data.split('\n')) {
        if (!line) {
            continue;
        }
        if (line.startsWith('|')) {
            const contentLine = line.slice(1);
            content = content != null ? content + '\n' + contentLine : contentLine;
            continue;
        }
        let newString = line;
        let newDepth = 0;
        if (line.startsWith(' ')) {
            newDepth = Math.min(directoriesStack.length + 1, occurrencesBeginningOfString(line, '  '));
            newString = line.slice(newDepth * 2);
        }
        await commit();
        prevString = newString;
        content = undefined;
        depth = newDepth;
    }

    await commit();

    async function commit() {
        if (prevString) {
            if (content != null) {
                await createFile(baseDir, directoriesStack, depth, prevString, content);
            } else {
                if (depth < directoriesStack.length) {
                    directoriesStack.length = depth;
                }
                await createDirectory(baseDir, directoriesStack, prevString);
                directoriesStack.push(prevString);
            }
        }
    }
}

/**
 * @param {string} baseDir 
 * @param {string[]} directoriesStack 
 * @param {number} depth 
 * @param {string} name 
 * @param {string} content 
 * @returns {Promise<void>}
 */
async function createFile(baseDir, directoriesStack, depth, name, content) {
    const filePath = path.join(baseDir, ...directoriesStack.slice(0, depth), name);
    await fs.writeFile(filePath, content);
}

/**
 * @param {string} baseDir
 * @param {string[]} directoriesStack
 * @param {string} name
 * @returns {Promise<void>}
 */
async function createDirectory(baseDir, directoriesStack, name) {
    const dirPath = path.join(baseDir, ...directoriesStack, name);
    await fs.mkdir(dirPath, { recursive: true });
}    

/**
 * @param {string} string
 * @param {string} subString
 * @returns {number}
 */
function occurrencesBeginningOfString(string, subString) {
    const splitted = string.split(subString);
    let count = 0;
    for (const part of splitted) {
        if (part === '') {
            count++;
        } else {
            break;
        }
    }
    return count;
}

/**
 * Converts files and directories in the file system to a string.
 * @param {string} baseDir
 * @returns {Promise<string>}
 */
export async function filesToString(baseDir) {
    return (await filesToStringArray(baseDir)).join('\n');
}

/**
 * @param {string} baseDir
 * @param {number} identation
 * @returns {Promise<string[]>}
 */
async function filesToStringArray(baseDir, identation = 0) {
    const files = await fs.readdir(baseDir, { withFileTypes: true });
    // sort files and directories
    files.sort((a, b) => a.name.localeCompare(b.name));
    /**
     * @type {string[]}
     */
    let result = [];
    for (const file of files) {
        result.push(identationString(identation) + file.name);
        if (file.isDirectory() || file.isSymbolicLink()) {            
            result.push(...await filesToStringArray(path.join(baseDir, file.name), identation + 1));
        } else {
            const content = await fs.readFile(path.join(baseDir, file.name), 'utf8');
            result.push(...content.split('\n').map(line => '|' + line));
        }
    }
    return result;
}

/**
 * @param {number} identation 
 * @returns {string}
 */
function identationString(identation) {
    return ' '.repeat(identation * 2);
}