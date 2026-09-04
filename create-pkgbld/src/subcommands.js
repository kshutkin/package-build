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
import { detectExtension, runRemove, runSetup } from './engine.js';
import { changesAffectDependencies, detectPackageManager, runInstall } from './install.js';
import { loadRegistry, resolveExtension } from './registry.js';
import { Tree } from './tree.js';

/**
 * @typedef {import('./registry.js').ExtensionEntry} ExtensionEntry
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
    registry: { type: /** @type {'string'} */ ('string'), description: 'Path to custom registry JSON' },
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
    const registryPath = /** @type {string | undefined} */ (args.values.registry)
        ? path.resolve(/** @type {string} */ (args.values.registry))
        : builtinRegistryPath;
    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const entries = await loadRegistry(registryPath, projectRoot);
    if (entries.length === 0) {
        console.log(gray('No extensions registered.'));
        return;
    }
    for (const entry of entries) {
        let installed = false;
        try {
            const ext = await resolveExtension(entry, projectRoot);
            const tree = new Tree(projectRoot);
            installed = detectExtension(ext, tree);
        } catch (/** @type {any} */ err) {
            console.log(`${pad16plus(entry.name)}${gray((entry.description ?? '').padEnd(40))}  ${red(`[Unresolved: ${err.message}]`)}`);
            continue;
        }
        const status = installed ? green('[Installed]') : gray('[Not installed]');
        console.log(`${white(pad16plus(entry.name))}${gray((entry.description ?? '').padEnd(40))}  ${status}`);
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
            parameters: ['<extension>'],
            options: commonOptions,
            args: argv,
        },
        [help, parameters]
    );
    const quiet = Boolean(args.values.quiet);
    const yes = Boolean(args.values.yes);
    const dryRun = Boolean(args.values['dry-run']);
    const installFlag = Boolean(args.values.install);
    const extName = /** @type {string} */ (args.parameters.extension);
    const projectRoot = process.cwd();
    const registryPath = /** @type {string | undefined} */ (args.values.registry)
        ? path.resolve(/** @type {string} */ (args.values.registry))
        : builtinRegistryPath;
    if (!quiet) console.log(`create-pkgbld v${version}\n`);

    const entries = await loadRegistry(registryPath, projectRoot);
    const entry = entries.find(e => e.name === extName);
    if (!entry) {
        console.error(red(`Extension "${extName}" not found in registry.`));
        process.exitCode = 1;
        return;
    }

    const ext = await resolveExtension(entry, projectRoot);
    const tree = new Tree(projectRoot);

    const options = await collectExtensionOptions(ext, tree, yes);

    const { ops } = await recordOps(tree, entry.name, async () => {
        if (mode === 'add') await runSetup(ext, tree, options);
        else await runRemove(ext, tree, options);
    });

    const changes = tree.listChanges();
    const conflicts = detectConflicts(ops);

    if (!quiet) {
        const verb = mode === 'add' ? 'Adding' : 'Removing';
        console.log(`${gray(`${verb} ${entry.name}:`)}${dryRun ? ` ${blue('(dry-run)')}` : ''}`);
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
