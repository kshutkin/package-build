import { execFileSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPackageJson, processPackageJson, toFormattedJson } from 'pkgbld/options';
import prompts from 'prompts';

import { gray, green, red, white, yellow } from '@niceties/ansi';
import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { help } from '@niceties/node-parseargs-plus/help';
import { parameters } from '@niceties/node-parseargs-plus/parameters';

import { formatConflicts } from './conflicts.js';
import { renderChanges } from './diff.js';
import getGitRoot from './get-git-root.js';
import { changesAffectDependencies, detectPackageManager, runInstall } from './install.js';
import { openPackageOperations } from './package-operations.js';
import { ProjectChanges } from './project-changes.js';
import { loadRegistry } from './registry.js';
import { runAdd, runList, runRemoveCmd } from './subcommands.js';
import { pad16plus, runInteractiveLoop } from './tui.js';

const SUBCOMMANDS = new Set(['add', 'remove', 'list']);

/**
 * @typedef {import('pkgbld/options').PackageJson} PackageJson
 * @typedef {import('./types.js').PkgInfo} PkgInfo
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinRegistryPath = path.resolve(__dirname, '..', 'extensions.json');

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
    if (pkg.mode === 'create') await initializePackage(pkg, targetDir);

    /** @type {import('./tui.js').PendingPackageOperation[]} */
    let pendingPackageOperations = [];

    if (!quiet && pkg.mode === 'update') {
        const registry = await loadRegistry(builtinRegistryPath);
        const packageOperations = await openPackageOperations({ projectRoot: targetDir, registry });
        try {
            pendingPackageOperations = await runInteractiveLoop({ packageOperations });
        } catch (/** @type {any} */ err) {
            if (err && err.message === 'cancelled') process.exit(-1);
            throw err;
        }
    }

    await fs.mkdir(targetDir, { recursive: true });
    const project = new ProjectChanges(targetDir);
    project.edit(tree => {
        tree.write('package.json', toFormattedJson(pkg.pkg));
        tree.write('README.md', pkg.readme);
    });

    for (const pending of pendingPackageOperations) {
        await pending.operation.stage(project, pending.answers);
    }

    const { changes, conflicts } = project.review();

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
        await project.commit();
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }

    if (!quiet) {
        for (const pending of pendingPackageOperations) {
            const { effect, package: item } = pending.operation;
            const verb = effect === 'adopt' ? green('adopted') : effect === 'remove' ? red('removed') : green('installed');
            console.log(`${gray('Package')} ${white(item.name)} ${verb}`);
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

async function reportVersion() {
    const createPkgBldPackage = await readPackage(path.resolve(__dirname, '..'));

    const version = createPkgBldPackage.pkg.version ?? '<unknown>';

    return version;
}

/**
 * @param {PkgInfo} pkg
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
async function initializePackage(pkg, targetDir) {
    /** @type {PackageJson} */
    const defaults = {
        version: '0.0.1',
        name: path.basename(targetDir),
        description: '',
        license: 'MIT',
        author: getGitConfigValue('user.name'),
        readme: 'README.md',
    };

    try {
        const url = getGitConfigValue('remote.origin.url');
        if (url) {
            const root = await getGitRoot();
            const directory = path.relative(root, targetDir);
            defaults.homepage = url.replace('.git', `/blob/main${directory ? `/${directory}` : ''}/README.md`);
            defaults.repository = /** @type {any} */ ({ type: 'git', url: `git+${url}`, directory: directory || undefined });
            defaults.bugs = url.replace('.git', '/issues');
        }
    } catch (_) {
        /* ignore */
    }
    pkg.pkg = processPackageJson(
        defaults,
        key => key in defaults,
        key => /** @type {Record<string, unknown>} */ (defaults)[key]
    );
    pkg.readme = `# ${defaults.name}`;
}

/**
 * @param {string} key
 * @returns {string}
 */
function getGitConfigValue(key) {
    try {
        return execFileSync('git', ['config', '--get', key], { encoding: 'utf8' }).trim();
    } catch (_) {
        return '';
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
