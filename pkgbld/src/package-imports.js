import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BuildEntryError, sourceFileExtensions } from './build-entries.js';

/**
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').BuildEntryIssue} BuildEntryIssue
 * @typedef {import('./types.js').ImportTarget} ImportTarget
 * @typedef {import('./types.js').BuildFormat} BuildFormat
 */

const javascriptExtensions = new Set(['.js', '.mjs', '.cjs']);

/**
 * Find every local JavaScript leaf of an authored package imports map.
 * Non-JavaScript and package-specifier leaves remain the responsibility of
 * their runtime resolver or producer.
 *
 * @param {unknown} imports
 * @param {BuildConfiguration} configuration
 * @param {unknown} packageType
 * @returns {Promise<ImportTarget[]>}
 */
export async function collectPackageImportTargets(imports, configuration, packageType) {
    if (imports === undefined || !configuration.resolution.imports) return [];

    /** @type {BuildEntryIssue[]} */
    const issues = [];
    /** @type {Map<string, ImportTarget>} */
    const targets = new Map();
    const leaves = parseImportMap(imports, issues);
    for (const leaf of leaves) {
        for (const target of await expandLocalTarget(leaf, configuration, packageType, issues)) {
            if (!targets.has(target.outputPath)) targets.set(target.outputPath, target);
        }
    }

    if (issues.length > 0) throw new BuildEntryError(issues);
    return [...targets.values()];
}

/**
 * Walk the authored map without selecting runtime conditions. Every local
 * branch may need its own output, while package specifiers remain mappings.
 * @param {unknown} imports
 * @param {BuildEntryIssue[]} issues
 */
function parseImportMap(imports, issues) {
    /** @type {{ value: string; issuePath: string; wildcardKey: boolean }[]} */
    const leaves = [];
    if (!isRecord(imports)) {
        issues.push({ code: 'INVALID_IMPORT_MAP', path: 'package.imports', message: 'must be an object' });
        return leaves;
    }

    for (const [key, value] of Object.entries(imports)) {
        const issuePath = `package.imports[${JSON.stringify(key)}]`;
        const stars = key.match(/\*/g)?.length ?? 0;
        if (!key.startsWith('#') || key === '#' || key.endsWith('/') || stars > 1) {
            issues.push({ code: 'INVALID_IMPORT_KEY', path: issuePath, message: `Invalid package import key ${JSON.stringify(key)}` });
            continue;
        }
        visit(value, issuePath, stars > 0);
    }
    return leaves;

    /** @param {unknown} value @param {string} issuePath @param {boolean} wildcardKey */
    function visit(value, issuePath, wildcardKey) {
        if (value === null) return;
        if (Array.isArray(value)) {
            for (const [index, leaf] of value.entries()) visit(leaf, `${issuePath}[${index}]`, wildcardKey);
            return;
        }
        if (isRecord(value)) {
            for (const [condition, leaf] of Object.entries(value)) {
                if (isArrayIndex(condition)) {
                    issues.push({
                        code: 'INVALID_IMPORT_CONDITION',
                        path: `${issuePath}.${condition}`,
                        message: `Integer condition key ${JSON.stringify(condition)} is invalid in a package imports map`,
                    });
                } else {
                    visit(leaf, `${issuePath}.${condition}`, wildcardKey);
                }
            }
            return;
        }
        if (typeof value !== 'string') {
            issues.push({ code: 'INVALID_IMPORT_TARGET', path: issuePath, message: 'must be a string, null, array, or condition object' });
            return;
        }
        if (!value.startsWith('./')) {
            if (value.startsWith('.') || value.startsWith('/') || value.includes('\\') || value.length === 0 || URL.canParse(value)) {
                issues.push({
                    code: 'INVALID_IMPORT_TARGET',
                    path: issuePath,
                    message: `Invalid package import target ${JSON.stringify(value)}`,
                });
            }
            return;
        }
        leaves.push({ value, issuePath, wildcardKey });
    }
}

/** @param {string} key */
function isArrayIndex(key) {
    return /^(0|[1-9]\d*)$/.test(key) && Number(key) < 2 ** 32 - 1;
}

/**
 * Validate a local URL target, then expand its output pattern against source
 * names. Final source-extension selection happens in resolveBuildEntries.
 * @param {{ value: string; issuePath: string; wildcardKey: boolean }} leaf
 * @param {BuildConfiguration} configuration
 * @param {unknown} packageType
 * @param {BuildEntryIssue[]} issues
 * @returns {Promise<ImportTarget[]>}
 */
async function expandLocalTarget({ value, issuePath, wildcardKey }, configuration, packageType, issues) {
    const pathPart = value.split(/[?#]/, 1)[0];
    const rawSegments = pathPart.slice(2).split('/');
    let outputPath;
    try {
        if (
            pathPart.includes('\\') ||
            rawSegments.some(segment => {
                const decoded = decodeURIComponent(segment);
                return (
                    decoded === '' ||
                    decoded === '.' ||
                    decoded === '..' ||
                    decoded.toLowerCase() === 'node_modules' ||
                    decoded.includes('/') ||
                    decoded.includes('\\')
                );
            })
        ) {
            throw new Error('invalid path segment');
        }
        outputPath = fileURLToPath(new URL(value, pathToFileURL(path.join(process.cwd(), 'package.json'))));
    } catch {
        issues.push({
            code: 'INVALID_IMPORT_TARGET',
            path: issuePath,
            message: `Invalid local package import target ${JSON.stringify(value)}`,
        });
        return [];
    }

    const extension = path.extname(outputPath);
    if (!javascriptExtensions.has(extension)) return [];

    const outputDir = path.resolve(configuration.paths.outputDir);
    if (!outputPath.startsWith(`${outputDir}${path.sep}`) || (pathPart.includes('*') && !wildcardKey)) {
        issues.push({
            code: 'INVALID_IMPORT_TARGET',
            path: issuePath,
            message: `Local JavaScript target ${JSON.stringify(value)} must be a safe path beneath ${configuration.paths.outputDir}`,
        });
        return [];
    }

    const format = /** @type {BuildFormat} */ (
        extension === '.mjs' ? 'es' : extension === '.cjs' ? 'cjs' : packageType === 'module' ? 'es' : 'cjs'
    );
    if (!configuration.outputs.formats.includes(format)) {
        issues.push({
            code: 'EXCLUDED_IMPORT_FORMAT',
            path: issuePath,
            message: `Local target ${JSON.stringify(value)} requires ${format}, which is excluded by outputs.formats`,
        });
        return [];
    }

    const relativeOutput = path.relative(outputDir, outputPath).replaceAll('\\', '/');
    const sourceName = relativeOutput.slice(0, -extension.length);
    if (pathPart.includes('*')) {
        const sourceNames = await findMatchingSourceNames(configuration.paths.sourceDir, sourceName);
        if (sourceNames.length === 0) {
            issues.push({
                code: 'SOURCE_NOT_FOUND',
                path: issuePath,
                message: `Import target ${JSON.stringify(value)} has no supported source file`,
            });
        }
        return sourceNames.map(matchedName => ({
            sourceName: matchedName,
            outputPath: `./${configuration.paths.outputDir}/${matchedName}${extension}`,
            format,
            issuePath,
        }));
    }
    return [{ sourceName, outputPath: `./${configuration.paths.outputDir}/${relativeOutput}`, format, issuePath }];
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {string} sourceDir @param {string} pattern */
async function findMatchingSourceNames(sourceDir, pattern) {
    const parts = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const matcher = new RegExp(
        `^${parts[0]}(.+?)${parts[1]}${parts
            .slice(2)
            .map(part => `\\1${part}`)
            .join('')}$`
    );
    /** @type {Set<string>} */
    const names = new Set();
    await walk(sourceDir, '');
    return [...names].sort();

    /** @param {string} directory @param {string} relative */
    async function walk(directory, relative) {
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
            throw error;
        }
        for (const entry of entries) {
            const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(path.join(directory, entry.name), nextRelative);
            } else if (entry.isFile()) {
                const extension = path.posix.extname(nextRelative).slice(1);
                if (sourceFileExtensions.includes(/** @type {typeof sourceFileExtensions[number]} */ (extension))) {
                    const name = nextRelative.slice(0, -(extension.length + 1));
                    if (matcher.test(name)) names.add(name);
                }
            }
        }
    }
}
