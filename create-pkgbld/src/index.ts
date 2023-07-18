/* eslint-disable @typescript-eslint/no-non-null-assertion */
import prompts from 'prompts';
import path from 'path';
import fs from 'fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import minimist from 'minimist';
import { green, grey, magenta, white } from 'kleur';
import { Option, PkgInfo } from './types';

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

    const state: Record<typeof options[number]['field'], string | Record<string, string>> = getOptionsValue(options);

    for (;;) {
        const topLevelAction = await prompts({
            type: 'select',
            name: 'value',
            message: 'Select an option to change, Done to execute, Ctrl+C to cancel',
            choices: [
                { title: green('Done'), description: `${pkg.mode === 'update' ? 'Update' : 'Create'} package`, value: 'done' },
                ...options.map(mapOption(state))
            ],
            initial: 0
        }, { onCancel });

        if (cancelled) {
            process.exit(-1);
        }

        if (topLevelAction.value === 'done') {
            break;
        }

        let option = options.find(item => item.field === topLevelAction.value)!;
        let mutateObject = state;

        if ('items' in option) {
            const nextLevelAction = await prompts([{
                type: 'select',
                name: 'value',
                message: option.title,
                choices: option.items.map(mapOption(state[option.field]! as Record<string, string>))
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
            initial: state[option.field] as string
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

function mapOption(state: Record<string, string | Record<string, string>>) {
    return (option: Option) => {
        const fieldValue = state[option.field]!;
        return {
            title: pad16plus(option.title) + magenta('items' in option ? viewObject(option.items, fieldValue as Record<string, string>) : fieldValue as string),
            value: option.field
        };
    };
}

function viewObject(items: Option[], json: Record<string, string>) {
    return items
        .map(item => grey(item.title) + ' ' + white(json[item.field] as string))
        .join(', ');
}

function getOptionsValue(options: Option[]): Record<string, string | Record<string, string>> {
    return options.reduce((accumulator, item) => ({
        ...accumulator,
        [item.field]: 'items' in item ? getOptionsValue(item.items) : item.initialValue
    }), {});
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
    const options: Option[] = [];
    try {
        const gitCfg = await gitConfig();
        if (gitCfg) {
            const url: string = gitCfg['remote "origin"'].url;
            options.push({
                title: 'Homepage',
                field: 'homepage',
                initialValue: url.replace('.git', `/blob/main/${packageName}/README.md`)
            });
            options.push({
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
                }],
                mutateInnerObject: true
            });
            options.push({
                title: 'Bugs',
                field: 'bugs',
                initialValue: url.replace('.git', '/issues')
            });
        }
    } catch (e) {
        /* ignore */
    }
    return options;
}

function getBasicOptions(packageName: string) {
    return [{
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
