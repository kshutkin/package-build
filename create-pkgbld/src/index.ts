/* eslint-disable @typescript-eslint/no-non-null-assertion */
import prompts from 'prompts';
import path from 'path';
import fs from 'fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import minimist from 'minimist';
import { green, grey, white } from 'kleur';
import { Option, PkgInfo, OptionsValue } from './types';

const done = Symbol('done');

async function execute() {
    await reportVersion();

    const targetDir = getTargetDir();

    console.log(grey(pad16plus('Target Directory', 0)) + white(targetDir));

    const pkg = await readPackage(targetDir);

    console.log(grey(pad16plus('Mode', 0)) + white(pkg.mode));
    
    const packageName = path.basename(targetDir);

    let cancelled = false;

    const options = getBasicOptions(packageName);

    options.push(...await getGitOptions(packageName));

    const state = getOptionsValue(options);

    for (;;) {
        const topLevelAction = await prompts({
            type: 'select',
            name: 'value',
            message: 'Select an option to change, Done to execute, Ctrl+C to cancel',
            choices: [
                { title: green('Done'), description: `${pkg.mode === 'update' ? 'Update' : 'Create'} package`, value: done },
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

        const action = await prompts([{
            type: 'text',
            name: option.field,
            message: option.title,
            initial: mutateObject[option.field] as string
        }], { onCancel });

        if (cancelled) {
            process.exit(-1);
        }

        mutateObject[option.field] = action[option.field];
    }

    if (cancelled) {
        process.exit(-1);
    }    

    Object.assign(pkg.pkg, state);

    pkg.readme ??= `# ${state.name}`;

    await writePackage(targetDir, pkg);
    
    function onCancel() {
        cancelled = true;
    }
}

execute();

function mapOption(state: OptionsValue) {
    return (option: Option) => {
        const fieldValue = state[option.field]!;
        return {
            title: pad16plus(option.title) + grey('items' in option ? getPrintString(option.items, (option.mutateInnerObject ? fieldValue as Record<string, string> : state as Record<string, string>)) : fieldValue as string),
            value: option.field
        };
    };
}

function getPrintString(items: Option[], json: OptionsValue): string {
    return items
        .map(item => grey(item.title) + ' ' + (json[item.field] ? white(
            'items' in item ?
                `[${getPrintString(item.items, (item.mutateInnerObject ? json[item.field] as OptionsValue :
                    json))}]` : json[item.field] as string) : green('<empty>'))
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

    console.log(grey(pad16plus('create-pkgbld', 0)) + white('v' + createPkgBldPackage.pkg.version));
}

function getTargetDir() {
    const parsedArgs = minimist(process.argv.slice(2));

    const targetDir = path.join(process.cwd(), parsedArgs._[0] ?? '.');

    return targetDir;
}

async function getGitOptions(packageName: string) {
    try {
        const gitCfg = await gitConfig();
        if (gitCfg) {
            const url: string = gitCfg['remote "origin"'].url;
            return [{
                title: 'Git',
                field: 'git',
                mutateInnerObject: false,
                items: [{
                    title: 'Homepage',
                    field: 'homepage',
                    initialValue: url.replace('.git', `/blob/main/${packageName}/README.md`)
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
                        field: 'directory'
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

function getBasicOptions(packageName: string) {
    return [{
        title: 'General',
        field: 'general',
        items: [{
            title: 'Package Name',
            field: 'name',
            initialValue: packageName
        }, {
            title: 'Version',
            field: 'version',
            initialValue: '0.0.1'
        }, {
            title: 'Description',
            field: 'description',
            initialValue: ''
        }, {
            title: 'License',
            field: 'license',
            initialValue: 'MIT'
        }, {
            title: 'Author',
            field: 'author',
            initialValue: userName() ?? ''
        }],
        mutateInnerObject: false
    }, {
        title: 'Destination folder',
        field: 'dest',
        initialValue: 'dest'
    }, {
        title: 'Source folder',
        field: 'src',
        initialValue: 'src'
    }] as Option[];
}

function pad16plus(value: string, indent = 4, offset = 3) {
    return value + ''.padEnd(offset - Math.floor((value.length + indent) / 8), '\t');
}

async function readPackage(dir: string) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    try {
        const pkgFile = await fs.readFile(packageFileName);
        const readmeFile = await fs.readFile(readmeFileName);
        return {
            pkg: JSON.parse(pkgFile.toString()),
            readme: readmeFile.toString(),
            mode: 'update' as const
        };
    } catch (e) { /**/ }

    return {
        pkg: {},
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
