import prompts from 'prompts';
import path from 'path';
import fs from 'fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import minimist from 'minimist';
import degit, { Info } from 'degit';

type PkgInfo = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pkg: any,
    readme: string
};

async function execute() {
    const myPkg = await readPackage(path.resolve(__dirname, '..'));

    console.log('create-pkgbld ' + myPkg.pkg.version);

    const parsedArgs = minimist(process.argv.slice(2));

    const packageName = parsedArgs._[0];

    const dir = packageName ?? '.';

    let cancelled = false;

    const chooseAction = await prompts({
        type: 'select',
        name: 'action',
        message: 'What do you need to do?',
        choices: [
            { title: 'Create Monorepo Root', value: 'root' },
            { title: 'Create a Subpackage', value: 'subpackage' }
        ],
        initial: 1
    }, { onCancel });

    if (cancelled) {
        process.exit(-1);
    }

    let rootPkg: PkgInfo = {
        pkg: {},
        readme: ''
    };

    if (chooseAction.action === 'subpackage') {
        rootPkg = await readPackage(path.resolve(dir, packageName ? '..' : '.'));
    }

    const template = chooseAction.action === 'root' ? 'kshutkin/monorepo-root' : 'kshutkin/monorepo-package';

    const emitter = degit(template, {
        cache: false,
        force: true,
        verbose: true,
    });
    
    emitter.on('info', (info: Info) => {
        console.log(info.message);
    });
    
    await emitter.clone(dir);

    const basePackageName = (packageName && path.basename(packageName)) || path.basename(process.cwd());

    if (chooseAction.action === 'root') {
        const response = await prompts([{
            type: 'text',
            name: 'name',
            message: 'package name',
            initial: basePackageName
        }, {
            type: 'text',
            name: 'scope',
            message: 'scope (without @ or empty)'
        }, {
            type: 'text',
            name: 'description',
            message: 'description',
            initial: ''
        }], { onCancel });

        if (cancelled) {
            process.exit(-1);
        }

        const fileName = path.join(dir, '.github/workflows/main.yml');
        let actionsTemplate = (await fs.readFile(fileName)).toString();
        actionsTemplate = actionsTemplate.replace('scope: # @echo scope', response.scope ? `scope: '@${response.scope}'` : '');
        await fs.writeFile(fileName, actionsTemplate);

        const readmeFileName = path.join(dir, 'README.md');
        const readme = `# ${response.name}\n${response.description}\n\n## Packages`;
        await fs.writeFile(readmeFileName, readme);
    }

    if (chooseAction.action === 'subpackage') {
        const response = await prompts([{
            type: 'text',
            name: 'name',
            message: 'package name',
            initial: basePackageName
        }, {
            type: 'text',
            name: 'version',
            message: 'version',
            initial: '1.0.0'
        }, {
            type: 'text',
            name: 'description',
            message: 'description',
            initial: ''
        }, {
            type: 'text',
            name: 'license',
            message: 'license',
            initial: 'MIT'
        }, {
            type: 'text',
            name: 'author',
            message: 'author',
            initial: userName() ?? ''
        }], { onCancel });

        if (cancelled) {
            process.exit(-1);
        }

        const gitInfo: {
            homepage: string,
            repository?: {
                type: string,
                url: string
            },
            bugs?: {
                url: string
            }
        } = {
            homepage: '',
            repository: undefined,
            bugs: undefined
        };

        try {
            const gitCfg = await gitConfig();
            if (gitCfg) {
                const url: string = gitCfg['remote "origin"'].url;
                gitInfo.homepage = url.replace('.git', `/blob/main/${basePackageName}/README.md`);
                gitInfo.repository = {
                    type: 'git',
                    url: `git+${url}`
                };
                gitInfo.bugs = {
                    url: url.replace('.git', '/issues')
                };
            }
        } catch(e) {
            /* ignore */
        }

        const pkg = await readPackage(dir);

        Object.assign(pkg.pkg, response, gitInfo);

        pkg.readme = `# ${response.name}`;

        await writePackage(dir, pkg);

        rootPkg.pkg.workspaces ??= [];
        rootPkg.pkg.workspaces.push(basePackageName);

        rootPkg.readme += `\n- [${basePackageName}](./${basePackageName}/README.md)`;

        await writePackage(path.resolve(dir, '..'), rootPkg);
    }

    function onCancel(){
        cancelled = true;
    }
}

execute();

async function readPackage(dir: string) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    try {
        const pkgFile = await fs.readFile(packageFileName);
        const readmeFile = await fs.readFile(readmeFileName);
        return {
            pkg: JSON.parse(pkgFile.toString()),
            readme: readmeFile.toString()
        };
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }
}

async function writePackage(dir: string, pkg: PkgInfo) {
    const packageFileName = path.resolve(dir, 'package.json');
    const readmeFileName = path.resolve(dir, 'README.md');
    try {
        await fs.writeFile(packageFileName, JSON.stringify(pkg.pkg, null, 2));
        await fs.writeFile(readmeFileName, pkg.readme);
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }
}
