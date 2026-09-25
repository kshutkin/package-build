import path from 'node:path';

import { isExists } from './helpers.js';

/**
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').BuildEntries} BuildEntries
 * @typedef {import('./types.js').BuildEntry} BuildEntry
 * @typedef {import('./types.js').BuildEntryContribution} BuildEntryContribution
 * @typedef {import('./types.js').BuildEntryContributions} BuildEntryContributions
 * @typedef {import('./types.js').BuildEntryIssue} BuildEntryIssue
 * @typedef {import('./types.js').BuildFormat} BuildFormat
 * @typedef {import('./types.js').ImportTarget} ImportTarget
 */

export const sourceFileExtensions = /** @type {const} */ (['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs']);

export class BuildEntryError extends Error {
    /** @param {BuildEntryIssue[]} issues */
    constructor(issues) {
        super(issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
        this.name = 'BuildEntryError';
        this.issues = issues;
    }
}

/**
 * Resolve package-declared and Build plugin-contributed entry specifications into
 * one immutable catalog.
 *
 * @param {readonly string[]} packageEntryNames
 * @param {readonly ImportTarget[]} importTargets
 * @param {BuildConfiguration} configuration
 * @param {(contributions: BuildEntryContributions) => void} contribute
 * @returns {Promise<BuildEntries>}
 */
export async function resolveBuildEntries(packageEntryNames, importTargets, configuration, contribute) {
    /** @type {(BuildEntryContribution & { issuePath: string; origin: 'export' | 'plugin'; manifestPath: string })[]} */
    const specifications = packageEntryNames.map((name, index) => ({
        name,
        issuePath: `package.entries[${index}]`,
        origin: 'export',
        manifestPath: `package.exports[${JSON.stringify(name === 'index' ? '.' : `./${name}`)}]`,
    }));
    let contributionIndex = 0;
    const contributions = {
        /** @param {BuildEntryContribution} contribution */
        add(contribution) {
            const issuePath = `plugins.entries[${contributionIndex}]`;
            specifications.push({ ...contribution, issuePath, origin: 'plugin', manifestPath: issuePath });
            contributionIndex += 1;
        },
    };
    contribute(contributions);

    /** @type {BuildEntryIssue[]} */
    const issues = [];
    /** @type {BuildEntry[]} */
    const values = [];
    /** @type {Map<string, BuildEntry>} */
    const byName = new Map();

    for (const specification of specifications) {
        const { issuePath } = specification;
        const name = normalizeName(specification.name, issuePath, issues);
        if (!name) continue;
        if (byName.has(name)) {
            issues.push({
                code: 'DUPLICATE_BUILD_ENTRY',
                path: issuePath,
                name,
                message: `Build entry ${JSON.stringify(name)} is declared more than once`,
            });
            continue;
        }

        const source = await resolveSource(name, specification.sourcePath, configuration.paths.sourceDir);
        if (!source) {
            issues.push({
                code: 'SOURCE_NOT_FOUND',
                path: issuePath,
                name,
                message: `Build entry ${JSON.stringify(name)} has no supported source file`,
            });
            continue;
        }

        /** @type {Partial<Record<BuildFormat, string>>} */
        const outputPaths = {};
        for (const format of configuration.outputs.formats) {
            if (format !== 'umd' || configuration.outputs.umdEntries.includes(name)) {
                outputPaths[format] =
                    `./${configuration.paths.outputDir}/${configuration.outputs.patterns[format].replace('[name]', name)}`;
            }
        }
        const entry = Object.freeze({
            name,
            origin: specification.origin,
            manifestPath: specification.manifestPath,
            sourcePath: source.sourcePath,
            extension: source.extension,
            outputPaths: Object.freeze(outputPaths),
        });
        values.push(entry);
        byName.set(name, entry);
    }

    for (const target of importTargets) {
        const name = `@imports/${target.outputPath.slice(2)}`;
        if (byName.has(name)) {
            issues.push({
                code: 'DUPLICATE_BUILD_ENTRY',
                path: target.issuePath,
                name,
                message: `Build entry ${JSON.stringify(name)} is declared more than once`,
            });
            continue;
        }
        const source = await resolveSource(target.sourceName, undefined, configuration.paths.sourceDir);
        if (!source) {
            issues.push({
                code: 'SOURCE_NOT_FOUND',
                path: target.issuePath,
                name,
                message: `Import target ${JSON.stringify(target.outputPath)} has no supported source file`,
            });
            continue;
        }
        const entry = Object.freeze({
            name,
            origin: /** @type {const} */ ('import'),
            manifestPath: target.issuePath,
            sourcePath: source.sourcePath,
            extension: source.extension,
            outputPaths: Object.freeze({ [target.format]: target.outputPath }),
        });
        values.push(entry);
        byName.set(name, entry);
    }

    validateSelections(byName, configuration.outputs.umdEntries, 'outputs.umdEntries', issues);
    validateSelections(byName, configuration.transforms.preprocess, 'transforms.preprocess', issues);
    const shared = validateOutputPaths(values, issues);

    if (issues.length > 0) throw new BuildEntryError(issues);

    for (const entry of shared) byName.delete(entry.name);
    const frozenValues = Object.freeze(values.filter(entry => !shared.has(entry)));
    return Object.freeze({
        values: frozenValues,
        /** @param {string} name */
        require(name) {
            const entry = byName.get(name);
            if (!entry) {
                throw new BuildEntryError([
                    {
                        code: 'SELECTED_BUILD_ENTRY_NOT_FOUND',
                        path: 'entries',
                        name,
                        message: `Build entry ${JSON.stringify(name)} was not discovered; available entries: ${frozenValues.map(entry => entry.name).join(', ')}`,
                    },
                ]);
            }
            return entry;
        },
    });
}

/**
 * @param {unknown} value
 * @param {string} issuePath
 * @param {BuildEntryIssue[]} issues
 */
function normalizeName(value, issuePath, issues) {
    if (typeof value !== 'string') {
        issues.push({ code: 'INVALID_BUILD_ENTRY_NAME', path: issuePath, message: 'Build entry name must be a string' });
        return;
    }
    const name = value.replaceAll('\\', '/');
    const segments = name.split('/');
    if (
        name.length === 0 ||
        name.startsWith('/') ||
        name.startsWith('./') ||
        path.isAbsolute(name) ||
        segments.some(segment => segment === '' || segment === '.' || segment === '..')
    ) {
        issues.push({
            code: 'INVALID_BUILD_ENTRY_NAME',
            path: issuePath,
            name,
            message: `Invalid Build entry name ${JSON.stringify(value)}`,
        });
        return;
    }
    return name;
}

/**
 * @param {string} name
 * @param {string | undefined} providedPath
 * @param {string} sourceDir
 * @returns {Promise<{ sourcePath: string; extension: import('./types.js').BuildEntryExtension } | undefined>}
 */
async function resolveSource(name, providedPath, sourceDir) {
    if (providedPath != null) {
        if (!(await isExists(providedPath))) return;
        const extension = path.extname(providedPath).slice(1);
        if (!sourceFileExtensions.includes(/** @type {typeof sourceFileExtensions[number]} */ (extension))) return;
        return { sourcePath: providedPath, extension: /** @type {import('./types.js').BuildEntryExtension} */ (extension) };
    }
    for (const extension of sourceFileExtensions) {
        const sourcePath = `./${sourceDir}/${name}.${extension}`;
        if (await isExists(sourcePath)) return { sourcePath, extension };
    }
}

/**
 * @param {Map<string, BuildEntry>} byName
 * @param {readonly string[]} names
 * @param {string} selectionPath
 * @param {BuildEntryIssue[]} issues
 */
function validateSelections(byName, names, selectionPath, issues) {
    for (const [index, name] of names.entries()) {
        if (!byName.has(name)) {
            issues.push({
                code: 'SELECTED_BUILD_ENTRY_NOT_FOUND',
                path: `${selectionPath}[${index}]`,
                name,
                message: `Build entry ${JSON.stringify(name)} was selected but not discovered`,
            });
        }
    }
}

/**
 * @param {BuildEntry[]} entries
 * @param {BuildEntryIssue[]} issues
 */
function validateOutputPaths(entries, issues) {
    /** @type {Map<string, { entry: BuildEntry; format: string }>} */
    const owners = new Map();
    /** @type {Set<BuildEntry>} */
    const shared = new Set();
    for (const entry of entries) {
        for (const [format, outputPath] of Object.entries(entry.outputPaths)) {
            const normalizedPath = path.resolve(outputPath);
            const owner = owners.get(normalizedPath);
            if (owner) {
                if (
                    entry.origin === 'import' &&
                    owner.format === format &&
                    path.resolve(entry.sourcePath) === path.resolve(owner.entry.sourcePath)
                ) {
                    shared.add(entry);
                } else {
                    issues.push({
                        code: 'OUTPUT_PATH_COLLISION',
                        path: entry.manifestPath,
                        name: entry.name,
                        message: `Output path ${JSON.stringify(outputPath)} conflicts with ${owner.entry.manifestPath}`,
                    });
                }
            } else {
                owners.set(normalizedPath, { entry, format });
            }
        }
    }
    return shared;
}
