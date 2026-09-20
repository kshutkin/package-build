import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

import { blue, gray, green, red, white, yellow } from '@niceties/ansi';
import { parseArgsPlus } from '@niceties/node-parseargs-plus';
import { help } from '@niceties/node-parseargs-plus/help';
import { parameters } from '@niceties/node-parseargs-plus/parameters';

import { detectConflicts, formatConflicts, recordOps } from './conflicts.js';
import { renderChanges } from './diff.js';
import { changesAffectDependencies, detectPackageManager, runInstall } from './install.js';
import { buildPackageInventory } from './inventory.js';
import { applyPackageIntent, ensurePackageExtension } from './package-operations.js';
import { loadRegistry } from './registry.js';
import { Tree } from './tree.js';

/**
 * @typedef {import('./registry.js').Extension} Extension
 * @typedef {import('./types.js').Option} Option
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

    const items = await buildPackageInventory(await loadRegistry(builtinRegistryPath), projectRoot);
    if (items.length === 0) {
        console.log(gray('No PKG BLD packages found.'));
        return;
    }
    for (const item of items) {
        console.log(
            `${white(pad16plus(item.entry.name))}${gray((item.entry.description ?? '').padEnd(40))}  ${formatState(item.state, item.error)}`
        );
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

    const items = await buildPackageInventory(await loadRegistry(builtinRegistryPath), projectRoot);
    const item = items.find(candidate => candidate.entry.name === requestedName || candidate.packageName === requestedName);
    if (!item) {
        console.error(red(`PKG BLD package "${requestedName}" not found.`));
        process.exitCode = 1;
        return;
    }

    if (mode === 'add') {
        if (item.state === 'installed-managed') {
            if (!quiet) console.log(gray(`${item.entry.name} is already managed.`));
            return;
        }
        if (item.state === 'unavailable') {
            console.error(red(`PKG BLD package "${requestedName}" is unavailable${item.error ? `: ${item.error}` : '.'}`));
            process.exitCode = 1;
            return;
        }
        item.intent = item.state === 'installed-unmanaged' ? 'adopt' : 'setup';
    } else {
        if (item.state === 'available') {
            console.error(red(`PKG BLD package "${requestedName}" is not installed.`));
            process.exitCode = 1;
            return;
        }
        item.intent = 'remove';
    }

    const tree = new Tree(projectRoot);
    if (item.hasExtensionContract && (item.intent === 'setup' || item.intent === 'remove')) {
        const ext = await ensurePackageExtension(item, projectRoot);
        item.options = await collectExtensionOptions(ext, tree, yes);
    }

    const { ops } = await recordOps(tree, item.entry.name, () => applyPackageIntent(item, tree, projectRoot));

    const changes = tree.listChanges();
    const conflicts = detectConflicts(ops);

    if (!quiet) {
        const verb = mode === 'add' ? 'Adding' : 'Removing';
        console.log(`${gray(`${verb} ${item.entry.name}:`)}${dryRun ? ` ${blue('(dry-run)')}` : ''}`);
        console.log(renderChanges(changes, { readDiskJson: p => readDiskJson(projectRoot, p) }));
        if (conflicts.length > 0) {
            console.log(yellow('\nConflicts detected:'));
            for (const line of formatConflicts(conflicts)) console.log(yellow(line));
        }
    }

    if (dryRun) return;

    const beforePkg = readDiskJson(projectRoot, 'package.json');
    await tree.commit();

    if (changesAffectDependencies(changes, projectRoot, beforePkg)) {
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
 * @param {Extension} ext
 * @param {Tree} tree
 * @param {boolean} yes
 * @returns {Promise<OptionsValue>}
 */
async function collectExtensionOptions(ext, tree, yes) {
    /** @type {OptionsValue} */
    const out = {};
    if (typeof ext.prompts !== 'function') return out;
    const items = ext.prompts(tree) ?? [];
    for (const opt of items) {
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
