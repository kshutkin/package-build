import prompts, { type PromptObject } from 'prompts';
import path from 'node:path';
import fs from 'node:fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import { cli } from 'cleye';
import kleur from 'kleur';
import type { Option, PkgInfo, OptionsValue } from './types';
import { parseArgsStringToArgv as toArgv } from 'string-argv';
import getGitRoot from './get-git-root';
import { cliFlags, processPackageJson, isPackageJson, toFormattedJson, type PackageJson, cliFlagsDefaults } from 'options';
import isEqual from 'lodash/isEqual.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const done = Symbol('done');

const formats = ['amd', 'cjs', 'es', 'iife', 'system', 'umd'];
const pkgbldBinaries = ['pkgbld', 'pkgbld-internal', 'node ../pkgbld/dist/index.js'];

async function execute() {
    const version = await reportVersion();

    const args = cli({
        name: 'create-pkgbld',
        version,
        parameters: [
            '[package name]'
        ],
        flags: {
            quiet: {
                type: Boolean,
                description: 'Quiet mode',
                default: false
            }
        }
    });

    if (!args.flags.quiet) args.showVersion();

    const targetDir = path.join(process.cwd(), args._.packageName ?? '.');

    if (!args.flags.quiet) console.log(kleur.grey(pad16plus('Target Directory', 0)) + kleur.white(targetDir));

    const pkg = await readPackage(targetDir);

    if (!args.flags.quiet) console.log(kleur.grey(pad16plus('Mode', 0)) + kleur.white(pkg.mode));
    
    const packageName = path.basename(targetDir);

    let cancelled = false;

    const options = getBasicOptions(packageName, pkg);

    options.push(...await getGitOptions(targetDir, pkg.pkg));

    options.push(...getPkgbldOptions(pkg.pkg));

    const state = getOptionsValue(options);

    if (!args.flags.quiet) {
        for (;;) {
            const topLevelAction = await prompts({
                type: 'select',
                name: 'value',
                message: 'Select an option to change, Done to execute, Escape to cancel',
                choices: [
                    { title: kleur.green('Done'), description: `${pkg.mode === 'update' ? 'Update' : 'Create'} package`, value: done },
                    ...options.map(mapOption(state))
                ],
                initial: 0
            }, { onCancel });

            if (cancelled) {
                process.exit(-1);
            }

            if (topLevelAction.value === done) {
                break;
            }

            let option = options.find(item => item.field === topLevelAction.value)!;
            let mutateObject = state;

            while ('items' in option) {
                const nextLevelAction = await prompts([{
                    type: 'select',
                    name: 'value',
                    message: option.title,
                    choices: option.items.map(mapOption(option.mutateInnerObject ? state[option.field] as Record<string, string> : state))
                }], { onCancel });

                if (cancelled) {
                    process.exit(-1);
                }

                if (option.mutateInnerObject) {
                    mutateObject = state[option.field] as Record<string, string>;
                }

                option = option.items.find(item => item.field === nextLevelAction.value)!;
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

function updatePackage(pkg: PkgInfo, options: OptionsValue) {
    pkg.pkg = processPackageJson(pkg.pkg, (key: string) => (key in options || key in pkg.pkg), treatKey);

    function treatKey(key: string) {
        if (key === 'scripts') {
            const scriptsCopy = { ...pkg.pkg.scripts };
            scriptsCopy.build = getScriptValue(options.pkgbld as OptionsValue);
        }
        return options[key] ?? (pkg.pkg as OptionsValue)[key];
    }
}

function getScriptValue(pkgbld: OptionsValue) {
    const binary = pkgbld.pkgbldBinary as string;
    const extraArgs = pkgbld.extraParameters as string;
    const pkgBldCopy = { ...pkgbld };
    pkgBldCopy.pkgbldBinary = undefined;
    pkgBldCopy.extraParameters = undefined;
    return `${binary} ${asCommandLineArgs(pkgBldCopy as Record<string, undefined | null | string | number | boolean>, cliFlagsDefaults)} ${extraArgs}`.trimEnd();
}

function getPromptOption(option: Option, mutateObject: OptionsValue) {
    const value = mutateObject[option.field] as string | string[] | undefined;
    const type = option.type ?? 'text';
    const promptOption: PromptObject<string>  = {
        type,
        name: option.field,
        message: option.title,
        initial: (Array.isArray(value) ? value.join(',') : value) ?? ''
    };
    if (type === 'multiselect') {
        promptOption.choices = 'list' in option ? option.list.map(item => ({
            title: item,
            value: item,
            selected: (value as string[]).includes(item)
        })) : [];
    }
    if (type === 'select') {
        promptOption.choices = 'list' in option ? option.list.map(item => ({
            title: item,
            value: item
        })) : [];
        promptOption.initial = promptOption.choices.findIndex(item => item.value === promptOption.initial);
    }
    return promptOption;
}

function mapOption(state: OptionsValue) {
    return (option: Option) => {
        const fieldValue = state[option.field];
        return {
            title: pad16plus(option.title) + kleur.grey('items' in option ? getPrintString(option, (option.mutateInnerObject ? fieldValue as Record<string, string> : state as Record<string, string>)) : fieldValue as string ?? ''),
            value: option.field
        };
    };
}

function getPrintString(option: {
    items: Option[];
    mutateInnerObject: boolean;
    render?: (option: Option, value: OptionsValue) => string;
}, json: OptionsValue): string /* ??? */ {
    if (option.render) {
        return option.render(option as Option, json);
    }
    return option.items
        .filter(item => item.field in json && json[item.field] && (Array.isArray(json[item.field]) ? (json[item.field] as unknown as unknown[]).length > 0 : true))
        .map(item => `${kleur.grey(item.title)} ${kleur.white(
            'items' in item ?
                `[${getPrintString(item, (item.mutateInnerObject ? json[item.field] as OptionsValue :
                    json))}]` : json[item.field] as string)}`
        )
        .join(', ');
}

function getOptionsValue(options: Option[]) {
    const result: OptionsValue = {};
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

async function getGitOptions(targetDir: string, packageJson: PackageJson) {
    try {
        const gitCfg = await gitConfig();
        if (gitCfg) {
            const url: string = gitCfg['remote "origin"'].url;
            const root = await getGitRoot();
            const directory = path.relative(root, targetDir);
            return [{
                title: 'Git',
                field: 'git',
                mutateInnerObject: false,
                render: (_option: Option, value: OptionsValue) => isEqual(removeEmpty({
                    repository: value.repository,
                    bugs: value.bugs,
                    homepage: value.homepage
                }), removeEmpty({
                    repository: packageJson.repository,
                    bugs: packageJson.bugs,
                    homepage: packageJson.homepage
                })) ? `[${kleur.green('Ok')}]` : `[${kleur.blue('Updated')}]`,
                items: [{
                    title: 'Homepage',
                    field: 'homepage',
                    initialValue: url.replace('.git', `/blob/main${directory ? `/${directory}` : ''}/README.md`)
                }, {
                    title: 'Repository',
                    field: 'repository',
                    items: [{
                        title: 'Type',
                        field: 'type',
                        initialValue: 'git'
                    }, {
                        title: 'Url',
                        field: 'url',
                        initialValue: `git+${url}`
                    }, {
                        title: 'Directory',
                        field: 'directory',
                        initialValue: directory || undefined
                    }],
                    mutateInnerObject: true
                }, {
                    title: 'Bugs',
                    field: 'bugs',
                    initialValue: url.replace('.git', '/issues')
                }]
            }];
        }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
        /* ignore */
    }
    return [];
}

function getPkgbldOptions(pkg: PackageJson) {
    let args: typeof cliFlagsDefaults & { extraParameters?: string } = cliFlagsDefaults;

    const cmd = pkg.scripts?.build ?? '';
    let binary = 'pkgbld';

    if (cmd) {
        
        if (cmd.startsWith('pkgbld-internal')) {
            binary =  'pkgbld-internal';
        } else if (cmd.startsWith('node ../pkgbld/dist/index.js')) {
            binary = 'node ../pkgbld/dist/index.js';
        } else if (!cmd.startsWith('pkgbld')) {
            const naiveArgs = cmd.split(' ');
            if (naiveArgs.length > 1 && naiveArgs[0] === 'node') {
                binary = `${naiveArgs[0]} ${naiveArgs[1]}`;
            } else if (naiveArgs.length > 0) {
                binary = naiveArgs[0] as string; // ?????
            }
        }

        const parsedArgs = cli({
            help: false,
            flags: cliFlags
        }, undefined, toArgv(cmd));

        args = parsedArgs.flags;
        args.extraParameters = asCommandLineArgs(parsedArgs.unknownFlags);
    }

    return [{
        title: 'pkgbld',
        field: 'pkgbld',
        mutateInnerObject: true,
        render: (_option: Option, value: OptionsValue) => cmd === getScriptValue(value) ? `[${kleur.green('Ok')}]` : `[${kleur.blue('Updated')}]`,
        items: [{
            title: 'Destination folder',
            field: 'dest',
            initialValue: args.dest
        }, {
            title: 'Source folder',
            field: 'src',
            initialValue: args.src
        }, {
            title: 'UMD exports',
            field: 'umd',
            initialValue: args.umd,
            type: 'list'
        }, {
            title: 'Compress formats',
            field: 'compress',
            initialValue: args.compress,
            type: 'multiselect',
            list: formats
        }, {
            title: 'Sorcemaps formats',
            field: 'sourcemaps',
            initialValue: args.sourcemaps,
            type: 'multiselect',
            list: formats
        }, {
            title: 'Formats',
            field: 'formats',
            initialValue: args.formats,
            type: 'multiselect',
            list: formats
        }, {
            title: 'Preprocess formats',
            field: 'preprocess',
            initialValue: args.preprocess,
            type: 'multiselect',
            list: formats
        }, {
            title: 'Binaries',
            field: 'bin',
            initialValue: args.bin,
            type: 'list'
        }, {
            title: 'Include externals',
            field: 'includeExternals',
            type: 'toggle',
            initialValue: args.includeExternals
        }, {
            title: 'Eject config',
            field: 'eject',
            type: 'toggle',
            initialValue: args.eject
        }, {
            title: 'Do not create tsconfig',
            field: 'noTsConfig',
            type: 'toggle',
            initialValue: args.noTsConfig
        }, {
            title: 'Do not update package.json',
            field: 'noUpdatePackageJson',
            type: 'toggle',
            initialValue: args.noUpdatePackageJson
        }, {
            title: 'Extra parameters',
            field: 'extraParameters',
            type: 'text',
            initialValue: args.extraParameters
        }, {
            title: 'Pkgbld Binary',
            field: 'pkgbldBinary',
            type: 'select',
            list: pkgbldBinaries.includes(binary) ? pkgbldBinaries : [...pkgbldBinaries, binary],
            initialValue: binary
        }]
    }];
}

function asCommandLineArgs(parsedArgs: Record<string, number | null | undefined | string | boolean | (string | boolean)[]>, defaultArgs: Record<string, number | null | undefined | string | boolean | (string | boolean)[]> = {}) {
    return Object.entries(parsedArgs)
        .filter(([key, value]) => !isEqual(value, defaultArgs[key]))
        .map(([key, value]) => `--${kebabize(key)}${typeof value === 'string' || Array.isArray(value) ? `=${asArray(value).join(',')}` : ''}`)
        .filter(Boolean)
        .join(' ');
}

function asArray<T>(value: T | T[]) {
    return Array.isArray(value) ? value : [value];
}

function getBasicOptions(packageName: string, pkg: PkgInfo) {
    return [{
        title: 'General',
        field: 'general',
        render: (_option: Option, value: OptionsValue) => isEqual(removeEmpty({
            name: value.name,
            version: value.version,
            description: value.description,
            license: value.license,
            author: value.author,
            readme: value.readme
        }), removeEmpty({
            name: pkg.pkg.name,
            version: pkg.pkg.version,
            description: pkg.pkg.description,
            license: pkg.pkg.license,
            author: pkg.pkg.author,
            readme: pkg.pkg.readme
        })) ? `[${kleur.green('Ok')}]` : `[${kleur.blue('Updated')}]`,
        items: [{
            title: 'Package Name',
            field: 'name',
            initialValue: chooseValue(pkg.pkg.name, packageName)
        }, {
            title: 'Version',
            field: 'version',
            initialValue: chooseValue(pkg.pkg.version, '0.0.1')
        }, {
            title: 'Description',
            field: 'description',
            initialValue: chooseValue(pkg.pkg.description, '')
        }, {
            title: 'License',
            field: 'license',
            initialValue: chooseValue(pkg.pkg.license, 'MIT')
        }, {
            title: 'Author',
            field: 'author',
            initialValue: chooseValue(toAuthorString(pkg.pkg.author), userName() ?? '')
        }, {
            title: 'Readme',
            field: 'readme',
            initialValue: chooseValue(pkg.pkg.readme, 'README.md')
        }],
        mutateInnerObject: false
    }] as Option[];

    function chooseValue(pkgValue: string | undefined, defaultValue: string) {
        return pkg.mode === 'update' ? pkgValue : defaultValue;
    }

    function toAuthorString(author: undefined | string | { name?: string, email?: string, url?: string }) {
        if (typeof author === 'string' || !author) {
            return author;
        }
        const name = author.name ?? '';
        const email = author.email ?? '';
        const url = author.url ?? '';
        return `${name}${email ? ` <${email}>` : ''}${url ? ` (${url})` : ''}`;
    }
}

function pad16plus(value: string, indent = 4, offset = 3) {
    return value + ''.padEnd(offset - Math.floor((value.length + indent) / 8), '\t');
}

async function readPackage(dir: string) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    const defaultPkg: PackageJson = {};
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
            mode: 'update' as const
        };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) { /**/ }

    return {
        pkg: defaultPkg,
        readme: '',
        mode: 'create' as const
    };
}

async function writePackage(dir: string, pkg: PkgInfo) {
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

function removeEmpty<T extends object>(data: T) {
    return JSON.parse(JSON.stringify(data)) as Partial<T>;
}

function kebabize(value: string) {
    return value.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? '-' : '') + $.toLowerCase());
}