import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';

import { cliFlags, cliFlagsDefaults as defaults } from './options/index.js';

/**
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('./types.js').BuildFormat} BuildFormat
 * @typedef {import('./types.js').BuildConfiguration} BuildConfiguration
 * @typedef {import('./types.js').BuildConfigurationDraft} BuildConfigurationDraft
 * @typedef {import('./types.js').ParsedOptions} ParsedOptions
 * @typedef {ReturnType<typeof import('./build-plugin-lifecycle.js').createBuildPluginLifecycle>} BuildPluginLifecycle
 */

const formats = new Set(['es', 'cjs', 'umd']);

export class BuildConfigurationError extends Error {
    /**
     * @param {{ code: string; path: string; message: string; value?: unknown }[]} issues
     * @param {{ cause?: unknown }} [options]
     */
    constructor(issues, options) {
        super(`Invalid Build configuration:\n${issues.map(issue => `- ${issue.path}: ${issue.message}`).join('\n')}`, options);
        this.name = 'BuildConfigurationError';
        this.issues = issues;
    }
}

/**
 * Resolves the immutable Build configuration for one build.
 *
 * @param {{
 *   argv?: readonly string[];
 *   packageJson: PackageJson;
 *   pluginLifecycle: BuildPluginLifecycle;
 * }} input
 * @returns {BuildConfiguration}
 */
export function resolveBuildConfiguration({ argv = process.argv.slice(2), packageJson, pluginLifecycle }) {
    const draft = createDefaultDraft();
    const defaultSource = deepFreeze(structuredClone(draft));
    applyPackageMetadata(draft, packageJson);

    const cli = parseCli(argv, packageJson);
    applyCli(draft, cli.values, cli.provided);

    const sources = deepFreeze({
        defaults: defaultSource,
        package: structuredClone(packageJson),
        cli: {
            values: structuredClone(cli.values),
            provided: { ...cli.provided },
        },
    });

    try {
        pluginLifecycle.configure(draft, sources);
    } catch (cause) {
        throw new BuildConfigurationError(
            [{ code: 'PLUGIN_CONFIGURATION_FAILED', path: 'plugins', message: 'Build plugin configuration failed' }],
            { cause }
        );
    }

    const structuralIssues = validateStructure(createDefaultDraft(), draft);
    if (structuralIssues.length > 0) {
        throw new BuildConfigurationError(structuralIssues);
    }

    normalize(draft);
    const issues = validate(draft, packageJson);
    if (issues.length > 0) {
        throw new BuildConfigurationError(issues);
    }

    return /** @type {BuildConfiguration} */ (deepFreeze(draft));
}

/** @returns {BuildConfigurationDraft} */
function createDefaultDraft() {
    return {
        paths: {
            sourceDir: defaults.src,
            outputDir: defaults.dest,
        },
        outputs: {
            formats: /** @type {BuildFormat[]} */ ([...defaults.formats]),
            patterns: {
                es: defaults.esmPattern,
                cjs: defaults.commonjsPattern,
                umd: defaults.umdPattern,
            },
            umdEntries: [...defaults.umd],
            sourcemaps: /** @type {BuildFormat[]} */ ([...defaults.sourcemaps]),
        },
        transforms: {
            compress: /** @type {BuildFormat[]} */ ([...defaults.compress]),
            preprocess: [...defaults.preprocess],
            includeExternals: defaults.includeExternals,
            removeLegalComments: false,
        },
        resolution: {
            imports: defaults.imports,
            conditions: [...defaults.conditions],
        },
        packageJson: {
            update: true,
            format: defaults.formatPackageJson,
            exports: true,
            pack: true,
            executables: { mode: 'infer', values: [] },
        },
        typescript: {
            updateConfig: defaults.tsConfig,
        },
        execution: {
            clean: true,
            bundle: true,
            eject: defaults.eject,
        },
    };
}

/**
 * @param {BuildConfigurationDraft} draft
 * @param {PackageJson} packageJson
 */
function applyPackageMetadata(draft, packageJson) {
    if (packageJson.imports !== undefined) {
        draft.resolution.imports = true;
    }
    if (typeof packageJson.umd === 'string') {
        draft.outputs.umdEntries.push('index');
        draft.outputs.formats.push('umd');
    }
}

/**
 * @param {readonly string[]} argv
 * @param {PackageJson} packageJson
 */
function parseCli(argv, packageJson) {
    const result = parseArgsPlus(
        {
            args: [...argv],
            name: 'pkgbld',
            version: packageJson.version ?? '<unknown>',
            options: /** @type {any} */ (cliFlags),
            allowNegative: true,
            tokens: true,
        },
        [help, camelCase, customValue]
    );
    /** @type {Record<string, boolean>} */
    const provided = {};
    for (const token of result.tokens ?? []) {
        if (token.kind === 'option') {
            provided[toCamelCase(token.name)] = true;
        }
    }
    return { values: /** @type {ParsedOptions} */ (result.values), provided };
}

/**
 * @param {BuildConfigurationDraft} draft
 * @param {ParsedOptions} flags
 * @param {Record<string, boolean>} provided
 */
function applyCli(draft, flags, provided) {
    if (provided.formats) {
        draft.outputs.formats = [.../** @type {BuildFormat[]} */ (flags.formats)];
        if (!draft.outputs.formats.includes('umd') && !provided.umd) {
            draft.outputs.umdEntries = [];
        }
    }
    if (provided.umd) {
        draft.outputs.umdEntries = [.../** @type {string[]} */ (flags.umd)];
        if (draft.outputs.umdEntries.length === 0 && !provided.formats) {
            draft.outputs.formats = draft.outputs.formats.filter(format => format !== 'umd');
        }
    }
    if (provided.compress) draft.transforms.compress = [.../** @type {BuildFormat[]} */ (flags.compress)];
    if (provided.sourcemaps) draft.outputs.sourcemaps = [.../** @type {BuildFormat[]} */ (flags.sourcemaps)];
    if (provided.preprocess) draft.transforms.preprocess = [.../** @type {string[]} */ (flags.preprocess)];
    if (provided.dest) draft.paths.outputDir = /** @type {string} */ (flags.dest);
    if (provided.src) draft.paths.sourceDir = /** @type {string} */ (flags.src);
    if (provided.bin) {
        const values = /** @type {string[]} */ (flags.bin);
        draft.packageJson.executables = { mode: values.length > 0 ? 'explicit' : 'disabled', values: [...values] };
    }
    if (provided.includeExternals) {
        draft.transforms.includeExternals = /** @type {boolean | string[]} */ (flags.includeExternals);
    }
    if (provided.imports) draft.resolution.imports = /** @type {boolean} */ (flags.imports);
    if (provided.conditions) draft.resolution.conditions = [.../** @type {string[]} */ (flags.conditions)];
    if (provided.eject) draft.execution.eject = /** @type {boolean} */ (flags.eject);
    if (provided.tsConfig) draft.typescript.updateConfig = /** @type {boolean} */ (flags.tsConfig);
    if (provided.updatePackageJson) draft.packageJson.update = /** @type {boolean} */ (flags.updatePackageJson);
    if (provided.commonjsPattern) draft.outputs.patterns.cjs = /** @type {string} */ (flags.commonjsPattern);
    if (provided.esmPattern) draft.outputs.patterns.es = /** @type {string} */ (flags.esmPattern);
    if (provided.umdPattern) draft.outputs.patterns.umd = /** @type {string} */ (flags.umdPattern);
    if (provided.formatPackageJson) draft.packageJson.format = /** @type {boolean} */ (flags.formatPackageJson);
    if (provided.pack) draft.packageJson.pack = /** @type {boolean} */ (flags.pack);
    if (provided.exports) draft.packageJson.exports = /** @type {boolean} */ (flags.exports);
    if (provided.clean) draft.execution.clean = /** @type {boolean} */ (flags.clean);
    if (provided.bundle) draft.execution.bundle = /** @type {boolean} */ (flags.bundle);
    if (provided.removeLegalComments) {
        draft.transforms.removeLegalComments = /** @type {boolean} */ (flags.removeLegalComments);
    }
}

/** @param {BuildConfigurationDraft} draft */
function normalize(draft) {
    if (Array.isArray(draft.outputs?.formats)) draft.outputs.formats = unique(draft.outputs.formats);
    if (Array.isArray(draft.outputs?.umdEntries)) draft.outputs.umdEntries = unique(draft.outputs.umdEntries);
    if (Array.isArray(draft.outputs?.sourcemaps)) draft.outputs.sourcemaps = unique(draft.outputs.sourcemaps);
    if (Array.isArray(draft.transforms?.compress)) draft.transforms.compress = unique(draft.transforms.compress);
    if (Array.isArray(draft.transforms?.preprocess)) draft.transforms.preprocess = unique(draft.transforms.preprocess);
    if (Array.isArray(draft.resolution?.conditions)) draft.resolution.conditions = unique(draft.resolution.conditions);
    if (Array.isArray(draft.transforms.includeExternals)) {
        draft.transforms.includeExternals = unique(draft.transforms.includeExternals);
    }
    if (Array.isArray(draft.packageJson?.executables?.values)) {
        draft.packageJson.executables.values = unique(draft.packageJson.executables.values.filter(Boolean));
        if (draft.packageJson.executables.mode === 'explicit' && draft.packageJson.executables.values.length === 0) {
            draft.packageJson.executables.mode = 'disabled';
        }
    }
    if (
        Array.isArray(draft.outputs?.umdEntries) &&
        Array.isArray(draft.outputs?.formats) &&
        draft.outputs.umdEntries.length > 0 &&
        !draft.outputs.formats.includes('umd')
    ) {
        draft.outputs.formats.push('umd');
    }
}

/**
 * @param {BuildConfigurationDraft} draft
 * @param {PackageJson} packageJson
 */
function validate(draft, packageJson) {
    /** @type {{ code: string; path: string; message: string; value?: unknown }[]} */
    const issues = [];
    validateFormats(draft.outputs.formats, 'outputs.formats', issues);
    validateFormats(draft.outputs.sourcemaps, 'outputs.sourcemaps', issues);
    validateFormats(draft.transforms.compress, 'transforms.compress', issues);
    validateStrings(draft.outputs.umdEntries, 'outputs.umdEntries', issues);
    validateStrings(draft.transforms.preprocess, 'transforms.preprocess', issues);
    validateStrings(draft.resolution.conditions, 'resolution.conditions', issues);
    if (draft.outputs.umdEntries.length > 0 && typeof packageJson.name !== 'string') {
        issues.push({ code: 'PACKAGE_NAME_REQUIRED', path: 'package.name', message: 'a package name is required for UMD entries' });
    }
    for (const [format, pattern] of Object.entries(draft.outputs.patterns)) {
        if (typeof pattern !== 'string' || !pattern.includes('[name]')) {
            issues.push({
                code: 'INVALID_FILE_NAME_PATTERN',
                path: `outputs.patterns.${format}`,
                message: 'must contain [name]',
                value: pattern,
            });
        }
    }
    for (const [path, value] of [
        ['paths.sourceDir', draft.paths.sourceDir],
        ['paths.outputDir', draft.paths.outputDir],
    ]) {
        if (typeof value !== 'string' || value.length === 0) {
            issues.push({ code: 'INVALID_PATH', path, message: 'must be a non-empty string', value });
        }
    }
    if (
        typeof draft.transforms.includeExternals !== 'boolean' &&
        (!Array.isArray(draft.transforms.includeExternals) ||
            draft.transforms.includeExternals.some(value => typeof value !== 'string' || value.length === 0))
    ) {
        issues.push({
            code: 'INVALID_EXTERNALS',
            path: 'transforms.includeExternals',
            message: 'must be a boolean or an array of non-empty strings',
            value: draft.transforms.includeExternals,
        });
    }
    if (!['infer', 'disabled', 'explicit'].includes(draft.packageJson.executables.mode)) {
        issues.push({
            code: 'INVALID_EXECUTABLE_MODE',
            path: 'packageJson.executables.mode',
            message: 'must be infer, disabled, or explicit',
            value: draft.packageJson.executables.mode,
        });
    }
    validateStrings(draft.packageJson.executables.values, 'packageJson.executables.values', issues);
    return issues;
}

/**
 * @param {object} expected
 * @param {unknown} actual
 * @returns {{ code: string; path: string; message: string; value?: unknown }[]}
 */
function validateStructure(expected, actual) {
    /** @type {{ code: string; path: string; message: string; value?: unknown }[]} */
    const issues = [];
    visit(expected, actual, '');
    return issues;

    /**
     * @param {unknown} expected
     * @param {unknown} actual
     * @param {string} path
     */
    function visit(expected, actual, path) {
        if (Array.isArray(expected)) {
            if (!Array.isArray(actual)) {
                issues.push({ code: 'INVALID_CONFIGURATION_SHAPE', path, message: 'must be an array', value: actual });
            }
            return;
        }
        if (typeof expected !== 'object' || expected == null) {
            const isExternalList = path === 'transforms.includeExternals' && Array.isArray(actual);
            if (!isExternalList && typeof actual !== typeof expected) {
                issues.push({
                    code: 'INVALID_CONFIGURATION_SHAPE',
                    path,
                    message: `must be ${typeof expected}`,
                    value: actual,
                });
            }
            return;
        }
        if (typeof actual !== 'object' || actual == null || Array.isArray(actual)) {
            issues.push({ code: 'INVALID_CONFIGURATION_SHAPE', path, message: 'must be an object', value: actual });
            return;
        }
        for (const key of Object.keys(actual)) {
            const keyPath = path ? `${path}.${key}` : key;
            if (!(key in expected)) {
                issues.push({ code: 'UNKNOWN_CONFIGURATION_KEY', path: keyPath, message: 'is not a recognized configuration key' });
            }
        }
        for (const key of Object.keys(expected)) {
            const keyPath = path ? `${path}.${key}` : key;
            if (!(key in actual)) {
                issues.push({ code: 'MISSING_CONFIGURATION_KEY', path: keyPath, message: 'is required' });
                continue;
            }
            visit(/** @type {Record<string, unknown>} */ (expected)[key], /** @type {Record<string, unknown>} */ (actual)[key], keyPath);
        }
    }
}

/**
 * @param {unknown} values
 * @param {string} path
 * @param {{ code: string; path: string; message: string; value?: unknown }[]} issues
 */
function validateFormats(values, path, issues) {
    if (!Array.isArray(values)) {
        issues.push({ code: 'INVALID_FORMATS', path, message: 'must be an array', value: values });
        return;
    }
    for (const value of values) {
        if (!formats.has(value)) {
            issues.push({ code: 'UNSUPPORTED_FORMAT', path, message: `unsupported format ${JSON.stringify(value)}`, value });
        }
    }
}

/**
 * @param {unknown} values
 * @param {string} path
 * @param {{ code: string; path: string; message: string; value?: unknown }[]} issues
 */
function validateStrings(values, path, issues) {
    if (!Array.isArray(values)) {
        issues.push({ code: 'INVALID_LIST', path, message: 'must be an array', value: values });
        return;
    }
    for (const value of values) {
        if (typeof value !== 'string' || value.length === 0) {
            issues.push({ code: 'INVALID_LIST_VALUE', path, message: 'must contain non-empty strings', value });
        }
    }
}

/** @template T @param {T[]} values @returns {T[]} */
function unique(values) {
    return [...new Set(values)];
}

/** @param {string} value */
function toCamelCase(value) {
    return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
    if (typeof value !== 'object' || value == null || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) {
        deepFreeze(nested);
    }
    return Object.freeze(value);
}
