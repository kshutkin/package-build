import prompts from 'prompts';
import path from 'path';
import fs from 'fs/promises';
import userName from 'git-user-name';
import gitConfig from 'parse-git-config';
import minimist from 'minimist';

type PkgInfo = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pkg: any,
    readme: string
};

async function execute() {

    // report version
    {
        const createPkgBldPackage = await readPackage(path.resolve(__dirname, '..'));

        console.log('create-pkgbld ' + createPkgBldPackage.pkg.version);
    }

    const parsedArgs = minimist(process.argv.slice(2));

    const targetDir = path.join(process.cwd(), parsedArgs._[0] ?? '.');
    
    const packageName = path.basename(targetDir);

    let cancelled = false;

    const response = await prompts([{
        type: 'text',
        name: 'name',
        message: 'package name',
        initial: packageName
    }, {
        type: 'text',
        name: 'version',
        message: 'version',
        initial: '0.0.1'
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
            gitInfo.homepage = url.replace('.git', `/blob/main/${packageName}/README.md`);
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

    const pkg = await readPackage(targetDir);

    Object.assign(pkg.pkg, response, gitInfo);

    pkg.readme = `# ${response.name}`;

    await writePackage(targetDir, pkg);
    
    function onCancel() {
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
    } catch (e) { /**/ }

    return {
        pkg: {},
        readme: ''
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
