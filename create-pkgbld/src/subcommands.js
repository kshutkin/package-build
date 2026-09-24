import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

import { blue, gray, green, red, white, yellow } from '@niceties/ansi';
import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { help } from '@niceties/node-parseargs-plus/help';
import { parameters } from '@niceties/node-parseargs-plus/parameters';

import { formatConflicts } from './conflicts.js';
import { renderChanges } from './diff.js';
import { changesAffectDependencies, detectPackageManager, runInstall } from './install.js';
import { openPackageOperations, PackageOperationError } from './package-operations.js';
import { resolveInstalledPackage } from './package-resolution.js';
import { ProjectChanges } from './project-changes.js';
import { loadRegistry } from './registry.js';

/**
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinRegistryPath = path.resolve(__dirname, '..', 'extensions.json');

const commonOptions = {
    quiet: { type: /** @type {'boolean'} */ ('boolean'), short: 'q', description: 'Quiet mode', default: false },
    yes: { type: /** @type {'boolean'} */ ('boolean'), short: 'y', description: 'Skip prompts, use defaults', default: false },
    'dry-run': { type: /** @type {'boolean'} */ ('boolean'), description: 'Print changes without writing', default: false },
    install: {
        type: /** @type {'boolean'} */ ('boolean'),
        description: 'Run package manager install after committing dependency changes',
        default: false,
    },
};

/**
 * @param {string} version
 * @param {string[]} argv
 */
export async function runList(version, argv) {
    const args = parseArgsPlus({ name: 'create-pkgbld list', version, options: commonOptions, args: argv }, [help, parameters]);
    const quiet = Boolean(args.values.quiet);
    const projectRoot = process.cwd();
    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const packages = await openPackageOperations({ projectRoot, registry: await loadRegistry(builtinRegistryPath) });
    printWarnings(packages.warnings);
    const items = packages.inventory;
    if (items.length === 0) {
        console.log(gray('No PKG BLD packages found.'));
        return;
    }
    for (const item of items) {
        console.log(`${white(pad16plus(item.name))}${gray(item.description.padEnd(40))}  ${formatState(item.state, item.error)}`);
    }
}

/**
 * @param {string} version
 * @param {string[]} argv
 */
export async function runAdd(version, argv) {
    return runAddOrRemove('add', version, argv);
}

/**
 * @param {string} version
 * @param {string[]} argv
 */
export async function runRemoveCmd(version, argv) {
    return runAddOrRemove('remove', version, argv);
}

/**
 * @param {string} version
 * @param {string[]} argv
 */
export async function runUpdate(version, argv) {
    const args = parseArgsPlus(
        {
            name: 'create-pkgbld update',
            version,
            parameters: ['<package>'],
            options: {
                ...commonOptions,
                'accept-conflicts': {
                    type: /** @type {'boolean'} */ ('boolean'),
                    description: 'Apply proposed replacements for migration conflicts',
                    default: false,
                },
            },
            args: argv,
        },
        [help, parameters]
    );
    const quiet = Boolean(args.values.quiet);
    const yes = Boolean(args.values.yes);
    const dryRun = Boolean(args.values['dry-run']);
    const acceptConflicts = Boolean(args.values['accept-conflicts']);
    const requestedName = /** @type {string} */ (args.parameters.package);
    const projectRoot = process.cwd();
    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const packages = await openPackageOperations({ projectRoot, registry: await loadRegistry(builtinRegistryPath) });
    printWarnings(packages.warnings);
    let operation;
    try {
        operation = await packages.prepare({ package: requestedName, target: 'updated' });
    } catch (/** @type {any} */ error) {
        if (error instanceof PackageOperationError) {
            console.error(red(`${error.message}.`));
            process.exitCode = 1;
            return;
        }
        throw error;
    }
    if (operation.effect === 'none') {
        if (!quiet) console.log(gray(`${operation.package.name} is already up to date.`));
        return;
    }

    const answers = await collectAnswers(operation.questions, yes);
    const project = new ProjectChanges(projectRoot);
    try {
        await operation.stage(project, answers);
    } catch (/** @type {any} */ error) {
        console.error(red(`Cannot update "${operation.package.name}": ${error.message ?? String(error)}`));
        process.exitCode = 1;
        return;
    }
    const { changes, conflicts } = project.review();
    const versions = operation.versionChange;
    if (!quiet) {
        console.log(
            `${gray(`Updating ${operation.package.name}${versions ? ` ${versions.from} -> ${versions.to}` : ''}:`)}${
                dryRun ? ` ${blue('(dry-run)')}` : ''
            }`
        );
        console.log(renderChanges(changes, { readDiskJson: p => readDiskJson(projectRoot, p) }));
        if (conflicts.length > 0) {
            console.log(yellow('\nConflicts detected:'));
            for (const line of formatConflicts(conflicts)) console.log(yellow(line));
        }
    }
    if (dryRun) return;

    if (conflicts.length > 0 && !acceptConflicts) {
        let approved = false;
        if (!yes && !quiet) {
            const answer = await prompts({
                type: 'confirm',
                name: 'accept',
                message: 'Apply the proposed replacements for these conflicts?',
                initial: false,
            });
            approved = Boolean(answer.accept);
        }
        if (!approved) {
            console.error(red('Update has unapplied conflicts. Review them and re-run with --accept-conflicts.'));
            process.exitCode = 1;
            return;
        }
    }

    const beforePkg = readDiskJson(projectRoot, 'package.json');
    if (operation.requiresInstall) {
        await project.commit({ lock: 'exclude' });
        const pm = detectPackageManager(projectRoot);
        if (!quiet) console.log(gray(`\nRunning ${pm} install...`));
        const code = await runInstall(pm, projectRoot);
        if (code !== 0) {
            console.error(red(`${pm} install exited with code ${code}; the PKG BLD lock was not advanced`));
            process.exitCode = code;
            return;
        }
        const installed = resolveInstalledPackage(operation.package.id, projectRoot)?.version;
        if (!versions || installed !== versions.to) {
            console.error(
                red(
                    `Installed plugin version ${installed ?? '<unresolved>'} does not match expected ${versions?.to ?? '<unknown>'}; the PKG BLD lock was not advanced`
                )
            );
            process.exitCode = 1;
            return;
        }
        await project.commit({ lock: 'only' });
    } else {
        await project.commit();
        await maybeInstallDependencies({ changes, projectRoot, beforePkg, installFlag: Boolean(args.values.install), quiet, yes });
    }
}

/**
 * @param {'add' | 'remove'} mode
 * @param {string} version
 * @param {string[]} argv
 */
async function runAddOrRemove(mode, version, argv) {
    const args = parseArgsPlus(
        {
            name: `create-pkgbld ${mode}`,
            version,
            parameters: ['<package>'],
            options: commonOptions,
            args: argv,
        },
        [help, parameters]
    );
    const quiet = Boolean(args.values.quiet);
    const yes = Boolean(args.values.yes);
    const dryRun = Boolean(args.values['dry-run']);
    const installFlag = Boolean(args.values.install);
    const requestedName = /** @type {string} */ (args.parameters.package);
    const projectRoot = process.cwd();
    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const packages = await openPackageOperations({ projectRoot, registry: await loadRegistry(builtinRegistryPath) });
    printWarnings(packages.warnings);
    const target = /** @type {import('./package-operations.js').PackageTarget} */ (mode === 'add' ? 'managed' : 'absent');
    let operation;
    try {
        operation = await packages.prepare({ package: requestedName, target });
    } catch (/** @type {any} */ error) {
        if (error instanceof PackageOperationError) {
            console.error(red(`${error.message}.`));
            process.exitCode = 1;
            return;
        }
        throw error;
    }
    if (operation.effect === 'none') {
        if (target === 'absent') {
            console.error(red(`PKG BLD package "${requestedName}" is not installed.`));
            process.exitCode = 1;
        } else if (!quiet) {
            console.log(gray(`${operation.package.name} is already managed.`));
        }
        return;
    }

    const answers = await collectAnswers(operation.questions, yes);
    const project = new ProjectChanges(projectRoot);
    await operation.stage(project, answers);
    const { changes, conflicts } = project.review();

    if (!quiet) {
        const verb = mode === 'add' ? 'Adding' : 'Removing';
        console.log(`${gray(`${verb} ${operation.package.name}:`)}${dryRun ? ` ${blue('(dry-run)')}` : ''}`);
        console.log(renderChanges(changes, { readDiskJson: p => readDiskJson(projectRoot, p) }));
        if (conflicts.length > 0) {
            console.log(yellow('\nConflicts detected:'));
            for (const line of formatConflicts(conflicts)) console.log(yellow(line));
        }
    }

    if (dryRun) return;

    const beforePkg = readDiskJson(projectRoot, 'package.json');
    await project.commit();

    await maybeInstallDependencies({ changes, projectRoot, beforePkg, installFlag, quiet, yes });
}

/** @param {{ changes: readonly import('./tree.js').FileChange[], projectRoot: string, beforePkg: any, installFlag: boolean, quiet: boolean, yes: boolean }} params */
async function maybeInstallDependencies({ changes, projectRoot, beforePkg, installFlag, quiet, yes }) {
    if (!changesAffectDependencies(changes, beforePkg)) return;
    const pm = detectPackageManager(projectRoot);
    let shouldInstall = installFlag;
    if (!shouldInstall && !yes && !quiet) {
        const ans = await prompts({ type: 'confirm', name: 'go', message: `Run ${pm} install now?`, initial: false });
        shouldInstall = Boolean(ans.go);
    }
    if (shouldInstall) {
        if (!quiet) console.log(gray(`\nRunning ${pm} install...`));
        const code = await runInstall(pm, projectRoot);
        if (code !== 0) {
            console.error(red(`${pm} install exited with code ${code}`));
            process.exitCode = code;
        }
    } else if (!quiet) {
        console.log(gray(`\nDependencies changed. Run "${pm} install" to apply (or re-run with --install).`));
    }
}

/** @param {readonly string[]} warnings */
function printWarnings(warnings) {
    for (const warning of warnings) console.warn(yellow(`Warning: ${warning}`));
}

/**
 * @param {string} projectRoot
 * @param {string} relPath
 */
function readDiskJson(projectRoot, relPath) {
    try {
        return JSON.parse(readFileSync(path.join(projectRoot, relPath), 'utf8'));
    } catch {
        return null;
    }
}

/**
 * @param {readonly import('./types.js').Option[]} questions
 * @param {boolean} yes
 * @returns {Promise<OptionsValue>}
 */
async function collectAnswers(questions, yes) {
    /** @type {OptionsValue} */
    const out = {};
    for (const opt of questions) {
        const initial = 'initialValue' in opt ? opt.initialValue : undefined;
        if (yes) {
            out[opt.field] = /** @type {any} */ (initial);
            continue;
        }
        const answer = await prompts({
            type: /** @type {any} */ (opt.type ?? 'text'),
            name: opt.field,
            message: opt.title,
            initial: /** @type {any} */ (initial),
        });
        out[opt.field] = answer[opt.field];
    }
    return out;
}

/**
 * @param {string} value
 * @param {number} [indent]
 * @param {number} [offset]
 */
function pad16plus(value, indent = 4, offset = 3) {
    return value + ''.padEnd(offset - Math.floor((value.length + indent) / 8), '\t');
}

/** @param {import('./inventory.js').PackageState} state @param {string | null} error */
function formatState(state, error) {
    if (state === 'available') return gray('[Available]');
    if (state === 'applied') return blue('[Applied]');
    if (state === 'installed-managed') return green('[Installed, managed]');
    if (state === 'installed-unmanaged') return yellow('[Installed, unmanaged]');
    return red(`[Unavailable${error ? `: ${error}` : ''}]`);
}
