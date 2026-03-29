import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import userName from 'git-user-name';
import isEqual from 'lodash/isEqual.js';
import { cliFlags, cliFlagsDefaults, isPackageJson, processPackageJson, toFormattedJson } from 'options';
import gitConfig from 'parse-git-config';
import prompts from 'prompts';
import { parseArgsStringToArgv as toArgv } from 'string-argv';

import { blue, gray, green, white } from '@niceties/ansi';
import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';
import { optionalValue } from '@niceties/node-parseargs-plus/optional-value';
import { parameters } from '@niceties/node-parseargs-plus/parameters';

import getGitRoot from './get-git-root.js';

/**
 * @typedef {import('options').PackageJson} PackageJson
 * @typedef {import('prompts').PromptObject} PromptObject
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 * @typedef {import('./types.js').PkgInfo} PkgInfo
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const done = Symbol('done');

const formats = ['amd', 'cjs', 'es', 'iife', 'system', 'umd'];
const pkgbldBinaries = ['pkgbld', 'pkgbld-internal', 'node ../pkgbld/dist/index.js'];

async function execute() {
    const version = await reportVersion();

    const args = parseArgsPlus(
        {
            name: 'create-pkgbld',
            version,
            parameters: ['[package name]'],
            options: {
                quiet: {
                    type: /** @type {'boolean'} */ ('boolean'),
                    description: 'Quiet mode',
                    default: false,
                },
            },
        },
        [help, parameters]
    );

    if (!args.values.quiet) console.log(`create-pkgbld v${version}\n`);

    const targetDir = path.join(process.cwd(), args.parameters.packageName ?? '.');

    if (!args.values.quiet) console.log(gray(pad16plus('Target Directory', 0)) + white(targetDir));

    const pkg = await readPackage(targetDir);

    if (!args.values.quiet) console.log(gray(pad16plus('Mode', 0)) + white(pkg.mode));

    const packageName = path.basename(targetDir);

    let cancelled = false;

    const options = getBasicOptions(packageName, pkg);

    options.push(...(await getGitOptions(targetDir, pkg.pkg)));

    options.push(...getPkgbldOptions(pkg.pkg));

    const state = getOptionsValue(options);

    if (!args.values.quiet) {
        for (;;) {
            const topLevelAction = await prompts(
                {
                    type: 'select',
                    name: 'value',
                    message: 'Select an option to change, Done to execute, Escape to cancel',
                    choices: [
                        { title: green('Done'), description: `${pkg.mode === 'update' ? 'Update' : 'Create'} package`, value: done },
                        ...options.map(mapOption(state)),
                    ],
                    initial: 0,
                },
                { onCancel }
            );

            if (cancelled) {
                process.exit(-1);
            }

            if (topLevelAction.value === done) {
                break;
            }

            let option = /** @type {Option} */ (options.find(item => item.field === topLevelAction.value));
            let mutateObject = state;

            while ('items' in option) {
                const nextLevelAction = await prompts(
                    [
                        {
                            type: 'select',
                            name: 'value',
                            message: option.title,
                            choices: option.items.map(
                                mapOption(option.mutateInnerObject ? /** @type {Record<string, string>} */ (state[option.field]) : state)
                            ),
                        },
                    ],
                    { onCancel }
                );

                if (cancelled) {
                    process.exit(-1);
                }

                if (option.mutateInnerObject) {
                    mutateObject = /** @type {Record<string, string>} */ (state[option.field]);
                }

                option = /** @type {Option} */ (option.items.find((/** @type {Option} */ item) => item.field === nextLevelAction.value));
            }

            const action = await prompts(getPromptOption(option, mutateObject), { onCancel });

            if (cancelled) {
                process.exit(-1);
            }

            mutateObject[option.field] = action[option.field];
        }

        if (cancelled) {
            process.exit(-1);
        }
    }

    updatePackage(pkg, state);

    pkg.readme ??= `# ${state.name}`;

    await writePackage(targetDir, pkg);

    function onCancel() {
        cancelled = true;
    }
}

execute();

/**
 * @param {PkgInfo} pkg
 * @param {OptionsValue} options
 */
function updatePackage(pkg, options) {
    pkg.pkg = processPackageJson(pkg.pkg, (/** @type {string} */ key) => key in options || key in pkg.pkg, treatKey);

    /**
     * @param {string} key
     */
    function treatKey(key) {
        if (key === 'scripts') {
            const scriptsCopy = { ...pkg.pkg.scripts };
            scriptsCopy.build = getScriptValue(/** @type {OptionsValue} */ (options.pkgbld));
        }
        return options[key] ?? /** @type {OptionsValue} */ (pkg.pkg)[key];
    }
}

/**
 * @param {OptionsValue} pkgbld
 * @returns {string}
 */
function getScriptValue(pkgbld) {
    const binary = /** @type {string} */ (pkgbld.pkgbldBinary);
    const extraArgs = /** @type {string} */ (pkgbld.extraParameters);
    const pkgBldCopy = { ...pkgbld };
    pkgBldCopy.pkgbldBinary = undefined;
    pkgBldCopy.extraParameters = undefined;
    return `${binary} ${asCommandLineArgs(/** @type {Record<string, undefined | null | string | number | boolean>} */ (pkgBldCopy), cliFlagsDefaults)} ${extraArgs}`.trimEnd();
}

/**
 * @param {Option} option
 * @param {OptionsValue} mutateObject
 * @returns {PromptObject}
 */
function getPromptOption(option, mutateObject) {
    const value = /** @type {string | string[] | undefined} */ (mutateObject[option.field]);
    const type = option.type ?? 'text';
    /** @type {PromptObject} */
    const promptOption = {
        type,
        name: option.field,
        message: option.title,
        initial: (Array.isArray(value) ? value.join(',') : value) ?? '',
    };
    if (type === 'multiselect') {
        promptOption.choices =
            'list' in option
                ? option.list.map((/** @type {string} */ item) => ({
                      title: item,
                      value: item,
                      selected: /** @type {string[]} */ (value).includes(item),
                  }))
                : [];
    }
    if (type === 'select') {
        promptOption.choices =
            'list' in option
                ? option.list.map((/** @type {string} */ item) => ({
                      title: item,
                      value: item,
                  }))
                : [];
        promptOption.initial = /** @type {import('prompts').Choice[]} */ (promptOption.choices).findIndex(
            (/** @type {import('prompts').Choice} */ item) => item.value === promptOption.initial
        );
    }
    return promptOption;
}

/**
 * @param {OptionsValue} state
 */
function mapOption(state) {
    return (/** @type {Option} */ option) => {
        const fieldValue = state[option.field];
        return {
            title:
                pad16plus(option.title) +
                gray(
                    'items' in option
                        ? getPrintString(
                              option,
                              option.mutateInnerObject
                                  ? /** @type {Record<string, string>} */ (fieldValue)
                                  : /** @type {Record<string, string>} */ (state)
                          )
                        : /** @type {string} */ (fieldValue ?? '')
                ),
            value: option.field,
        };
    };
}

/**
 * @param {{ items: Option[]; mutateInnerObject: boolean; render?: (option: Option, value: OptionsValue) => string; }} option
 * @param {OptionsValue} json
 * @returns {string}
 */
function getPrintString(option, json) {
    if (option.render) {
        return option.render(/** @type {Option} */ (option), json);
    }
    return option.items
        .filter(
            item =>
                item.field in json &&
                json[item.field] &&
                (Array.isArray(json[item.field]) ? /** @type {unknown[]} */ (json[item.field]).length > 0 : true)
        )
        .map(
            item =>
                `${gray(item.title)} ${white(
                    'items' in item
                        ? `[${getPrintString(item, item.mutateInnerObject ? /** @type {OptionsValue} */ (json[item.field]) : json)}]`
                        : /** @type {string} */ (json[item.field])
                )}`
        )
        .join(', ');
}

/**
 * @param {Option[]} options
 * @returns {OptionsValue}
 */
function getOptionsValue(options) {
    /** @type {OptionsValue} */
    const result = {};
    for (const item of options) {
        if ('items' in item) {
            const value = getOptionsValue(item.items);
            if (item.mutateInnerObject) {
                result[item.field] = value;
            } else {
                Object.assign(result, value);
            }
        } else {
            result[item.field] = item.initialValue;
        }
    }
    return result;
}

async function reportVersion() {
    const createPkgBldPackage = await readPackage(path.resolve(__dirname, '..'));

    const version = createPkgBldPackage.pkg.version ?? '<unknown>';

    return version;
}

/**
 * @param {string} targetDir
 * @param {PackageJson} packageJson
 * @returns {Promise<Option[]>}
 */
async function getGitOptions(targetDir, packageJson) {
    try {
        const gitCfg = await gitConfig();
        if (gitCfg) {
            const url = /** @type {string} */ (gitCfg['remote "origin"'].url);
            const root = await getGitRoot();
            const directory = path.relative(root, targetDir);
            return [
                {
                    title: 'Git',
                    field: 'git',
                    mutateInnerObject: false,
                    render: (/** @type {Option} */ _option, /** @type {OptionsValue} */ value) =>
                        isEqual(
                            removeEmpty({
                                repository: value.repository,
                                bugs: value.bugs,
                                homepage: value.homepage,
                            }),
                            removeEmpty({
                                repository: packageJson.repository,
                                bugs: packageJson.bugs,
                                homepage: packageJson.homepage,
                            })
                        )
                            ? `[${green('Ok')}]`
                            : `[${blue('Updated')}]`,
                    items: [
                        {
                            title: 'Homepage',
                            field: 'homepage',
                            initialValue: url.replace('.git', `/blob/main${directory ? `/${directory}` : ''}/README.md`),
                        },
                        {
                            title: 'Repository',
                            field: 'repository',
                            items: [
                                {
                                    title: 'Type',
                                    field: 'type',
                                    initialValue: 'git',
                                },
                                {
                                    title: 'Url',
                                    field: 'url',
                                    initialValue: `git+${url}`,
                                },
                                {
                                    title: 'Directory',
                                    field: 'directory',
                                    initialValue: directory || undefined,
                                },
                            ],
                            mutateInnerObject: true,
                        },
                        {
                            title: 'Bugs',
                            field: 'bugs',
                            initialValue: url.replace('.git', '/issues'),
                        },
                    ],
                },
            ];
        }
    } catch (_) {
        /* ignore */
    }
    return [];
}

/**
 * @param {PackageJson} pkg
 * @returns {Option[]}
 */
function getPkgbldOptions(pkg) {
    /** @type {typeof cliFlagsDefaults & { extraParameters?: string }} */
    let args = cliFlagsDefaults;

    const cmd = pkg.scripts?.build ?? '';
    let binary = 'pkgbld';

    if (cmd) {
        if (cmd.startsWith('pkgbld-internal')) {
            binary = 'pkgbld-internal';
        } else if (cmd.startsWith('node ../pkgbld/dist/index.js')) {
            binary = 'node ../pkgbld/dist/index.js';
        } else if (!cmd.startsWith('pkgbld')) {
            const naiveArgs = cmd.split(' ');
            if (naiveArgs.length > 1 && naiveArgs[0] === 'node') {
                binary = `${naiveArgs[0]} ${naiveArgs[1]}`;
            } else if (naiveArgs.length > 0) {
                binary = /** @type {string} */ (naiveArgs[0]);
            }
        }

        const binaryWords = binary.split(/\s+/).length;
        const argv = toArgv(cmd).slice(binaryWords);

        const parsedArgs = parseArgsPlus(
            {
                options: cliFlags,
                strict: false,
                args: argv,
            },
            [camelCase, customValue, optionalValue]
        );

        const knownKeys = new Set(Object.keys(cliFlags));
        /** @type {Record<string, number | null | undefined | string | boolean | (string | boolean)[]>} */
        const unknownFlags = {};
        for (const [key, value] of Object.entries(parsedArgs.values)) {
            if (knownKeys.has(key)) {
                if (value !== undefined) {
                    /** @type {Record<string, unknown>} */ (args)[key] = value;
                }
            } else {
                unknownFlags[key] = /** @type {string | boolean} */ (value);
            }
        }
        args = { ...cliFlagsDefaults, ...args };
        args.extraParameters = asCommandLineArgs(unknownFlags);
    }

    return [
        {
            title: 'pkgbld',
            field: 'pkgbld',
            mutateInnerObject: true,
            render: (/** @type {Option} */ _option, /** @type {OptionsValue} */ value) =>
                cmd === getScriptValue(value) ? `[${green('Ok')}]` : `[${blue('Updated')}]`,
            items: [
                {
                    title: 'Destination folder',
                    field: 'dest',
                    initialValue: args.dest,
                },
                {
                    title: 'Source folder',
                    field: 'src',
                    initialValue: args.src,
                },
                {
                    title: 'UMD exports',
                    field: 'umd',
                    initialValue: args.umd,
                    type: 'list',
                },
                {
                    title: 'Compress formats',
                    field: 'compress',
                    initialValue: args.compress,
                    type: 'multiselect',
                    list: formats,
                },
                {
                    title: 'Sorcemaps formats',
                    field: 'sourcemaps',
                    initialValue: args.sourcemaps,
                    type: 'multiselect',
                    list: formats,
                },
                {
                    title: 'Formats',
                    field: 'formats',
                    initialValue: args.formats,
                    type: 'multiselect',
                    list: formats,
                },
                {
                    title: 'Preprocess formats',
                    field: 'preprocess',
                    initialValue: args.preprocess,
                    type: 'multiselect',
                    list: formats,
                },
                {
                    title: 'Binaries',
                    field: 'bin',
                    initialValue: args.bin,
                    type: 'list',
                },
                {
                    title: 'Include externals',
                    field: 'includeExternals',
                    type: 'toggle',
                    initialValue: args.includeExternals,
                },
                {
                    title: 'Eject config',
                    field: 'eject',
                    type: 'toggle',
                    initialValue: args.eject,
                },
                {
                    title: 'Do not create tsconfig',
                    field: 'noTsConfig',
                    type: 'toggle',
                    initialValue: args.noTsConfig,
                },
                {
                    title: 'Do not update package.json',
                    field: 'noUpdatePackageJson',
                    type: 'toggle',
                    initialValue: args.noUpdatePackageJson,
                },
                {
                    title: 'Extra parameters',
                    field: 'extraParameters',
                    type: 'text',
                    initialValue: args.extraParameters,
                },
                {
                    title: 'Pkgbld Binary',
                    field: 'pkgbldBinary',
                    type: 'select',
                    list: pkgbldBinaries.includes(binary) ? pkgbldBinaries : [...pkgbldBinaries, binary],
                    initialValue: binary,
                },
            ],
        },
    ];
}

/**
 * @param {Record<string, number | null | undefined | string | boolean | (string | boolean)[]>} parsedArgs
 * @param {Record<string, number | null | undefined | string | boolean | (string | boolean)[]>} [defaultArgs]
 * @returns {string}
 */
function asCommandLineArgs(parsedArgs, defaultArgs = {}) {
    return Object.entries(parsedArgs)
        .filter(([key, value]) => !isEqual(value, defaultArgs[key]))
        .map(
            ([key, value]) => `--${kebabize(key)}${typeof value === 'string' || Array.isArray(value) ? `=${asArray(value).join(',')}` : ''}`
        )
        .filter(Boolean)
        .join(' ');
}

/**
 * @template T
 * @param {T | T[]} value
 * @returns {T[]}
 */
function asArray(value) {
    return Array.isArray(value) ? value : [value];
}

/**
 * @param {string} packageName
 * @param {PkgInfo} pkg
 * @returns {Option[]}
 */
function getBasicOptions(packageName, pkg) {
    return /** @type {Option[]} */ ([
        {
            title: 'General',
            field: 'general',
            render: (/** @type {Option} */ _option, /** @type {OptionsValue} */ value) =>
                isEqual(
                    removeEmpty({
                        name: value.name,
                        version: value.version,
                        description: value.description,
                        license: value.license,
                        author: value.author,
                        readme: value.readme,
                    }),
                    removeEmpty({
                        name: pkg.pkg.name,
                        version: pkg.pkg.version,
                        description: pkg.pkg.description,
                        license: pkg.pkg.license,
                        author: pkg.pkg.author,
                        readme: pkg.pkg.readme,
                    })
                )
                    ? `[${green('Ok')}]`
                    : `[${blue('Updated')}]`,
            items: [
                {
                    title: 'Package Name',
                    field: 'name',
                    initialValue: chooseValue(pkg.pkg.name, packageName),
                },
                {
                    title: 'Version',
                    field: 'version',
                    initialValue: chooseValue(pkg.pkg.version, '0.0.1'),
                },
                {
                    title: 'Description',
                    field: 'description',
                    initialValue: chooseValue(pkg.pkg.description, ''),
                },
                {
                    title: 'License',
                    field: 'license',
                    initialValue: chooseValue(pkg.pkg.license, 'MIT'),
                },
                {
                    title: 'Author',
                    field: 'author',
                    initialValue: chooseValue(toAuthorString(pkg.pkg.author), userName() ?? ''),
                },
                {
                    title: 'Readme',
                    field: 'readme',
                    initialValue: chooseValue(pkg.pkg.readme, 'README.md'),
                },
            ],
            mutateInnerObject: false,
        },
    ]);

    /**
     * @param {string | undefined} pkgValue
     * @param {string} defaultValue
     */
    function chooseValue(pkgValue, defaultValue) {
        return pkg.mode === 'update' ? pkgValue : defaultValue;
    }

    /**
     * @param {undefined | string | { name?: string; email?: string; url?: string; }} author
     * @returns {string | undefined}
     */
    function toAuthorString(author) {
        if (typeof author === 'string' || !author) {
            return author;
        }
        const name = author.name ?? '';
        const email = author.email ?? '';
        const url = author.url ?? '';
        return `${name}${email ? ` <${email}>` : ''}${url ? ` (${url})` : ''}`;
    }
}

/**
 * @param {string} value
 * @param {number} [indent]
 * @param {number} [offset]
 */
function pad16plus(value, indent = 4, offset = 3) {
    return value + ''.padEnd(offset - Math.floor((value.length + indent) / 8), '\t');
}

/**
 * @param {string} dir
 * @returns {Promise<PkgInfo>}
 */
async function readPackage(dir) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    /** @type {PackageJson} */
    const defaultPkg = {};
    try {
        const pkgFile = await fs.readFile(packageFileName);
        const readmeFile = await fs.readFile(readmeFileName);
        const pkg = JSON.parse(pkgFile.toString());
        const isValidPackageJson = isPackageJson(pkg);
        if (!isValidPackageJson) {
            console.error('Invalid package.json');
            throw new Error('Invalid package.json');
        }
        return {
            pkg,
            readme: readmeFile.toString(),
            mode: /** @type {const} */ ('update'),
        };
    } catch (_) {
        /**/
    }

    return {
        pkg: defaultPkg,
        readme: '',
        mode: /** @type {const} */ ('create'),
    };
}

/**
 * @param {string} dir
 * @param {PkgInfo} pkg
 */
async function writePackage(dir, pkg) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(packageFileName, toFormattedJson(pkg.pkg));
        await fs.writeFile(readmeFileName, pkg.readme);
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }
}

/**
 * @template {object} T
 * @param {T} data
 * @returns {Partial<T>}
 */
function removeEmpty(data) {
    return /** @type {Partial<T>} */ (JSON.parse(JSON.stringify(data)));
}

/**
 * @param {string} value
 * @returns {string}
 */
function kebabize(value) {
    return value.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? '-' : '') + $.toLowerCase());
}
