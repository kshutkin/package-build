import prompts, { PromptObject } from 'prompts';
import path from 'path';
import fs from 'fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import { cli } from 'cleye';
import kleur from 'kleur';
import { Option, PkgInfo, OptionsValue, PackageJson } from './types';
import typia from 'typia';
import { parseArgsStringToArgv as toArgv } from 'string-argv';
import getGitRoot from './get-git-root';

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
            quite: {
                type: Boolean,
                description: 'Quite mode',
                default: false
            }
        }
    });

    args.showVersion();

    const targetDir = path.join(process.cwd(), args._.packageName ?? '.');

    console.log(kleur.grey(pad16plus('Target Directory', 0)) + kleur.white(targetDir));

    const pkg = await readPackage(targetDir);

    console.log(kleur.grey(pad16plus('Mode', 0)) + kleur.white(pkg.mode));
    
    const packageName = path.basename(targetDir);

    let cancelled = false;

    const options = getBasicOptions(packageName, pkg);

    options.push(...await getGitOptions(targetDir));

    options.push(...getPkgbldOptions(pkg.pkg));

    const state = getOptionsValue(options);

    if (!args.flags.quite) {
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
                    choices: option.items.map(mapOption(option.mutateInnerObject ? state[option.field]! as Record<string, string> : state))
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
    const order = new Set([
        'private',
        'type',
        'version',
        'name',
        'description',
        'license',
        'author',
        'bin',
        'main',
        'module',
        'exports',
        'types',
        'typings',
        'files',
        'engines',
        'repository',
        'bugs',
        'homepage',
        'keywords',
        'scripts',
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
        'publishConfig'
    ]);

    const newPkg: OptionsValue = {};

    for (const key of order) {
        if (key in options || key in pkg.pkg) {
            newPkg[key] = treatKey(key);
        }
    }

    for (const key in pkg.pkg) {
        if (!order.has(key)) {
            newPkg[key] = (pkg.pkg as OptionsValue)[key];
        }
    }

    pkg.pkg = newPkg;

    function treatKey(key: string) {
        if (key === 'scripts') {
            const scriptsCopy = { ...pkg.pkg.scripts };
            console.log(options);
            scriptsCopy.build = getScriptValue(options.pkgbld as OptionsValue);
        }
        return options[key] ?? (pkg.pkg as OptionsValue)[key];
    }
}

function getScriptValue(pkgbld: OptionsValue) {
    const binary = pkgbld.pkgbldBinary as string;
    const extraArgs = pkgbld.extraParameters as string;
    const pkgBldCopy = { ...pkgbld };
    delete pkgBldCopy['pkgbldBinary'];
    delete pkgBldCopy['extraParameters'];
    return `${binary} ${asCommandLineArgs(pkgBldCopy as Record<string, undefined | null | string | number | boolean>)} ${extraArgs}`;
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
        const fieldValue = state[option.field]!;
        return {
            title: pad16plus(option.title) + kleur.grey('items' in option ? getPrintString(option.items, (option.mutateInnerObject ? fieldValue as Record<string, string> : state as Record<string, string>)) : fieldValue as string ?? ''),
            value: option.field
        };
    };
}

function getPrintString(items: Option[], json: OptionsValue): string /* ??? */ {
    return items
        .filter(item => item.field in json && json[item.field] && (Array.isArray(json[item.field]) ? (json[item.field] as unknown as unknown[]).length > 0 : true))
        .map(item => kleur.grey(item.title) + ' ' + (kleur.white(
            'items' in item ?
                `[${getPrintString(item.items, (item.mutateInnerObject ? json[item.field] as OptionsValue :
                    json))}]` : json[item.field] as string))
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
            result[item.field] = item.initialValue!;
        }
    }
    return result;
}

async function reportVersion() {
    const createPkgBldPackage = await readPackage(path.resolve(__dirname, '..'));

    const version = createPkgBldPackage.pkg.version ?? '<unknown>';

    return version;
}

async function getGitOptions(targetDir: string) {
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
                items: [{
                    title: 'Homepage',
                    field: 'homepage',
                    initialValue: url.replace('.git', `/blob/main${directory ? '/' + directory : ''}/README.md`)
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
    } catch (e) {
        /* ignore */
    }
    return [];
}

function getPkgbldOptions(pkg: PackageJson) {
    let args: Record<string, string | boolean | string[] | undefined> = {
        formats: ['es', 'cjs'],
        umd: [] as string[],
        compress: ['umd'],
        sourcemaps: ['umd'],
        preprocess: [] as string[],
        dir: 'dist',
        sourceDir: 'src',
        bin: undefined as string[] | undefined,
        includeExternals: false,
        eject: false,
        noTsConfig: false,
        noUpdatePackageJson: false
    };

    function CommaSeparatedString(value: string) {
        return value.split(',').map((arg: string) => arg.trim());
    }

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
                binary = naiveArgs[0] + ' ' + naiveArgs[1];
            } else if (naiveArgs.length > 0) {
                binary = naiveArgs[0] as string; // ?????
            }
        }

        const parsedArgs = cli({
            help: false,
            flags: {
                umd: {
                    type: CommaSeparatedString,
                    default: args.umd
                },
                compress: {
                    type: CommaSeparatedString,
                    default: args.compress
                },
                sourcemaps: {
                    type: CommaSeparatedString,
                    default: args.sourcemaps
                },
                formats: {
                    type: CommaSeparatedString,
                    default: args.formats
                },
                preprocess: {
                    type: CommaSeparatedString,
                    default: args.preprocess
                },
                dir: {
                    type: String,
                    default: args.dir
                },
                sourceDir: {
                    type: String,
                    default: args.sourceDir
                },
                bin: {
                    type: CommaSeparatedString,
                    default: args.bin
                },
                includeExternals: {
                    type: Boolean,
                    default: args.includeExternals
                },
                eject: {
                    type: Boolean,
                    default: args.eject
                },
                noTsConfig: {
                    type: Boolean,
                    default: args.noTsConfig
                },
                noUpdatePackageJson: {
                    type: Boolean,
                    default: args.noUpdatePackageJson
                }
            }
        }, undefined, toArgv(cmd));

        args = parsedArgs.flags;
        args.extraParameters = asCommandLineArgs(parsedArgs.unknownFlags);
    }

    return [{
        title: 'pkgbld',
        field: 'pkgbld',
        mutateInnerObject: true,
        items: [{
            title: 'Destination folder',
            field: 'dest',
            initialValue: args.dir
        }, {
            title: 'Source folder',
            field: 'src',
            initialValue: args.sourceDir
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
            title: 'Create tsconfig',
            field: 'tsConfig',
            type: 'toggle',
            initialValue: !args.noTsConfig
        }, {
            title: 'Update package.json',
            field: 'updatePackageJson',
            type: 'toggle',
            initialValue: !args.noUpdatePackageJson
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

function asCommandLineArgs(parsedArgs: Record<string, number | null | undefined | string | boolean | (string | boolean)[]>)  {
    return Object.entries(parsedArgs)
        .flatMap(([key, value]) => asArray(value)
            .filter(Boolean)
            .map(value => `--${key}${typeof value === 'string' ? `=${value}` : ''}`)
        ).join(' ');
}

function asArray<T>(value: T | T[]) {
    return Array.isArray(value) ? value : [value];
}

function getBasicOptions(packageName: string, pkg: PkgInfo) {
    return [{
        title: 'General',
        field: 'general',
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
            initialValue: chooseValue(pkg.pkg.author, userName() ?? '')
        }],
        mutateInnerObject: false
    }] as Option[];

    function chooseValue(pkgValue: string | undefined, defaultValue: string) {
        return pkg.mode === 'update' ? pkgValue : defaultValue;
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
        const isValidPackageJson = typia.is<PackageJson>(pkg);
        if (!isValidPackageJson) {
            console.error('Invalid package.json');
        }
        return {
            pkg: isValidPackageJson ? pkg : defaultPkg,
            readme: readmeFile.toString(),
            mode: 'update' as const
        };
    } catch (e) { /**/ }

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
        await fs.writeFile(packageFileName, JSON.stringify(pkg.pkg, null, 2), { });
        await fs.writeFile(readmeFileName, pkg.readme);
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }
}
