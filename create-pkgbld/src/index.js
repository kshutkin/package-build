import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import userName from 'git-user-name';
import isEqual from 'lodash/isEqual.js';
import gitConfig from 'parse-git-config';
import { cliFlags, cliFlagsDefaults, isPackageJson, processPackageJson, toFormattedJson } from 'pkgbld/options';
import prompts from 'prompts';
import { parseArgsStringToArgv as toArgv } from 'string-argv';

import { blue, gray, green, red, white, yellow } from '@niceties/ansi';
import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { camelCase } from '@niceties/node-parseargs-plus/camel-case';
import { customValue } from '@niceties/node-parseargs-plus/custom-value';
import { help } from '@niceties/node-parseargs-plus/help';
import { optionalValue } from '@niceties/node-parseargs-plus/optional-value';
import { parameters } from '@niceties/node-parseargs-plus/parameters';

import { detectConflicts, formatConflicts, recordOps } from './conflicts.js';
import { renderChanges } from './diff.js';
import { runRemove, runSetup } from './engine.js';
import getGitRoot from './get-git-root.js';
import { changesAffectDependencies, detectPackageManager, runInstall } from './install.js';
import { loadRegistry } from './registry.js';
import { runAdd, runList, runRemoveCmd } from './subcommands.js';
import { Tree } from './tree.js';
import { buildExtensionMenuItems, getOptionsValue, pad16plus, runInteractiveLoop } from './tui.js';

const SUBCOMMANDS = new Set(['add', 'remove', 'list']);

/**
 * @typedef {import('pkgbld/options').PackageJson} PackageJson
 * @typedef {import('prompts').PromptObject} PromptObject
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 * @typedef {import('./types.js').PkgInfo} PkgInfo
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinRegistryPath = path.resolve(__dirname, '..', 'extensions.json');

const formats = ['amd', 'cjs', 'es', 'iife', 'system', 'umd'];
const pkgbldBinaries = ['pkgbld', 'node ../pkgbld/dist/index.js'];

async function execute() {
    const version = await reportVersion();

    const sub = process.argv[2];
    if (sub && SUBCOMMANDS.has(sub)) {
        const rest = process.argv.slice(3);
        if (sub === 'list') return runList(version, rest);
        if (sub === 'add') return runAdd(version, rest);
        if (sub === 'remove') return runRemoveCmd(version, rest);
    }

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
                install: {
                    type: /** @type {'boolean'} */ ('boolean'),
                    description: 'Run package manager install after commit if deps changed',
                    default: false,
                },
            },
        },
        [help, parameters]
    );

    const quiet = Boolean(args.values.quiet);
    const installFlag = Boolean(args.values.install);

    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const targetDir = path.join(process.cwd(), args.parameters.packageName ?? '.');

    if (!quiet) console.log(gray(pad16plus('Target Directory', 0)) + white(targetDir));

    const pkg = await readPackage(targetDir);

    if (!quiet) console.log(gray(pad16plus('Mode', 0)) + white(pkg.mode));

    const packageName = path.basename(targetDir);

    const options = getBasicOptions(packageName, pkg);
    options.push(...(await getGitOptions(targetDir, pkg.pkg)));
    options.push(...getPkgbldOptions(pkg.pkg));

    const state = getOptionsValue(options);

    /** @type {import('./tui.js').ExtensionMenuItem[]} */
    let extensionItems = [];

    if (!quiet) {
        const registry = await loadRegistry(builtinRegistryPath, targetDir);
        extensionItems = await buildExtensionMenuItems(registry, targetDir);

        try {
            await runInteractiveLoop({ options, state, extensionItems, mode: pkg.mode, projectRoot: targetDir });
        } catch (/** @type {any} */ err) {
            if (err && err.message === 'cancelled') process.exit(-1);
            throw err;
        }
    }

    updatePackage(pkg, state);
    pkg.readme ??= `# ${state.name}`;

    const tree = new Tree(targetDir);
    await fs.mkdir(targetDir, { recursive: true });
    tree.write('package.json', toFormattedJson(pkg.pkg));
    tree.write('README.md', pkg.readme);

    /** @type {import('./conflicts.js').RecordedOp[]} */
    const allOps = [];
    for (const item of extensionItems) {
        if (!item.intent || !item.ext) continue;
        const { ops } = await recordOps(tree, item.entry.name, async () => {
            if (item.intent === 'setup') await runSetup(/** @type {any} */ (item.ext), tree, item.options);
            else await runRemove(/** @type {any} */ (item.ext), tree, item.options);
        });
        allOps.push(...ops);
    }

    const changes = tree.listChanges();
    const conflicts = detectConflicts(allOps);

    if (!quiet) {
        console.log(`\n${gray('Pending changes:')}`);
        console.log(renderChanges(changes, { readDiskJson: p => readDiskJsonFromDir(targetDir, p) }));
        if (conflicts.length > 0) {
            console.log(yellow('\nConflicts detected:'));
            for (const line of formatConflicts(conflicts)) console.log(yellow(line));
        }
    }

    const beforePkg = readDiskJsonFromDir(targetDir, 'package.json');
    try {
        await tree.commit();
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }

    if (!quiet) {
        const applied = extensionItems.filter(i => i.intent);
        for (const item of applied) {
            const verb = item.intent === 'setup' ? green('installed') : red('removed');
            console.log(`${gray('Extension')} ${white(item.entry.name)} ${verb}`);
        }
    }

    if (changesAffectDependencies(changes, targetDir, beforePkg)) {
        const pm = detectPackageManager(targetDir);
        let shouldInstall = installFlag;
        if (!shouldInstall && !quiet) {
            const ans = await prompts({ type: 'confirm', name: 'go', message: `Run ${pm} install now?`, initial: false });
            shouldInstall = Boolean(ans.go);
        }
        if (shouldInstall) {
            if (!quiet) console.log(gray(`\nRunning ${pm} install...`));
            const code = await runInstall(pm, targetDir);
            if (code !== 0) {
                console.error(red(`${pm} install exited with code ${code}`));
                process.exitCode = code;
            }
        } else if (!quiet) {
            console.log(gray(`\nDependencies changed. Run "${pm} install" to apply (or pass --install).`));
        }
    }
}

/**
 * @param {string} dir
 * @param {string} relPath
 */
function readDiskJsonFromDir(dir, relPath) {
    try {
        return JSON.parse(fsSync.readFileSync(path.join(dir, relPath), 'utf8'));
    } catch {
        return null;
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
        if (cmd.startsWith('node ../pkgbld/dist/index.js')) {
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
                allowNegative: true,
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
                    title: 'Create tsconfig',
                    field: 'tsConfig',
                    type: 'toggle',
                    initialValue: args.tsConfig,
                },
                {
                    title: 'Update package.json',
                    field: 'updatePackageJson',
                    type: 'toggle',
                    initialValue: args.updatePackageJson,
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
        .map(([key, value]) => {
            if (typeof value === 'boolean') {
                return value ? `--${kebabize(key)}` : `--no-${kebabize(key)}`;
            }
            if (typeof value === 'string' || Array.isArray(value)) {
                return `--${kebabize(key)}=${asArray(value).join(',')}`;
            }
            return `--${kebabize(key)}`;
        })
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
