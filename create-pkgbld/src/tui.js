import prompts from 'prompts';

import { blue, gray, green, red } from '@niceties/ansi';

import { buildPackageInventory } from './inventory.js';
import { ensurePackageExtension } from './package-operations.js';
import { Tree } from './tree.js';

/**
 * @typedef {import('prompts').PromptObject} PromptObject
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 * @typedef {import('./inventory.js').PackageItem} ExtensionMenuItem
 */

export const done = Symbol('done');
const EXT_PREFIX = '__ext__:';

/**
 * @param {string} value
 * @param {number} [indent]
 * @param {number} [offset]
 */
export function pad16plus(value, indent = 4, offset = 3) {
    return value + ''.padEnd(offset - Math.floor((value.length + indent) / 8), '\t');
}

/**
 * Convert an Option leaf into a prompts() configuration.
 *
 * @param {Option} option
 * @param {OptionsValue} mutateObject
 * @returns {PromptObject}
 */
export function getPromptOption(option, mutateObject) {
    const value = /** @type {string | string[] | undefined} */ (mutateObject[option.field]);
    const type = option.type ?? 'text';
    /** @type {PromptObject} */
    const promptOption = {
        type,
        name: option.field,
        message: option.title,
        initial: (Array.isArray(value) ? value.join(',') : value) ?? '',
    };
    if (type === 'multiselect') {
        promptOption.choices =
            'list' in option
                ? option.list.map((/** @type {string} */ item) => ({
                      title: item,
                      value: item,
                      selected: /** @type {string[]} */ (value).includes(item),
                  }))
                : [];
    }
    if (type === 'select') {
        promptOption.choices =
            'list' in option
                ? option.list.map((/** @type {string} */ item) => ({
                      title: item,
                      value: item,
                  }))
                : [];
        promptOption.initial = /** @type {import('prompts').Choice[]} */ (promptOption.choices).findIndex(
            (/** @type {import('prompts').Choice} */ item) => item.value === promptOption.initial
        );
    }
    return promptOption;
}

/**
 * Build menu items from registry, project lock, and project dependencies.
 *
 * @param {import('./registry.js').ExtensionEntry[]} registry
 * @param {string} projectRoot
 * @returns {Promise<ExtensionMenuItem[]>}
 */
export async function buildExtensionMenuItems(registry, projectRoot) {
    return buildPackageInventory(registry, projectRoot);
}

/**
 * Render one extension menu item label.
 *
 * @param {ExtensionMenuItem} item
 */
function renderExtensionLabel(item) {
    const left = pad16plus(item.entry.name);
    if (item.state === 'unavailable') {
        return `${left}${red('[Unavailable]')} ${gray(item.error)}`;
    }
    if (item.intent === 'setup') {
        return `${left}${blue('[Pending setup]')}`;
    }
    if (item.intent === 'adopt') {
        return `${left}${blue('[Pending adoption]')}`;
    }
    if (item.intent === 'remove') {
        return `${left}${blue('[Pending remove]')}`;
    }
    if (item.state === 'available') return `${left}${gray('[Available]')}`;
    if (item.state === 'applied') return `${left}${blue('[Applied]')}`;
    if (item.state === 'installed-managed') return `${left}${green('[Installed, managed]')}`;
    if (item.state === 'installed-unmanaged') return `${left}${blue('[Installed, unmanaged]')}`;
    return `${left}${red('[Unavailable]')}`;
}

/**
 * Toggle pending intent for an extension menu item. Mirrors the spec:
 *   - if there's already a pending intent → clear it
 *   - managed installed packages are removed
 *   - unmanaged installed packages are adopted by default
 *   - available/applied packages are set up
 *
 * @param {ExtensionMenuItem} item
 */
export function toggleExtensionIntent(item) {
    if (item.intent !== null) {
        item.intent = null;
        item.options = {};
        return;
    }
    if (item.state === 'installed-managed') item.intent = 'remove';
    else if (item.state === 'installed-unmanaged') item.intent = 'adopt';
    else item.intent = 'setup';
}

/**
 * Mutates `extensionItems` (intents + collected options) in place. Throws if
 * the user cancels.
 *
 * @param {{
 *   extensionItems: ExtensionMenuItem[],
 *   projectRoot: string
 * }} params
 */
export async function runInteractiveLoop({ extensionItems, projectRoot }) {
    let cancelled = false;
    function onCancel() {
        cancelled = true;
    }

    for (;;) {
        const pluginAction = await prompts(
            {
                type: 'select',
                name: 'value',
                message: 'Select a PKG BLD package, Done to execute, Escape to cancel',
                choices: [
                    { title: green('Done'), value: /** @type {any} */ (done) },
                    ...extensionItems.map(item => ({ title: renderExtensionLabel(item), value: `${EXT_PREFIX}${item.entry.name}` })),
                ],
                initial: 0,
            },
            { onCancel }
        );
        if (cancelled) throw new Error('cancelled');
        if (pluginAction.value === done) return;

        if (typeof pluginAction.value === 'string' && pluginAction.value.startsWith(EXT_PREFIX)) {
            const name = pluginAction.value.slice(EXT_PREFIX.length);
            const item = extensionItems.find(i => i.entry.name === name);
            if (!item) continue;
            if (item.state === 'unavailable') {
                console.log(red(`Package "${name}" is unavailable: ${item.error ?? 'not resolvable'}`));
                continue;
            }
            if (item.state === 'installed-unmanaged' && item.intent === null) {
                const action = await prompts(
                    {
                        type: 'select',
                        name: 'value',
                        message: `Manage ${item.entry.name}`,
                        choices: [
                            { title: 'Adopt', value: 'adopt' },
                            { title: 'Remove', value: 'remove' },
                            { title: 'Cancel', value: null },
                        ],
                    },
                    { onCancel }
                );
                if (cancelled) throw new Error('cancelled');
                if (action.value === null || action.value === undefined) continue;
                item.intent = action.value;
            } else {
                toggleExtensionIntent(item);
            }
            if (item.intent === 'setup' && item.hasExtensionContract && !item.ext) {
                try {
                    await ensurePackageExtension(item, projectRoot);
                } catch (/** @type {any} */ err) {
                    item.intent = null;
                    item.error = err.message ?? String(err);
                    item.state = 'unavailable';
                    console.log(red(`Package "${name}" is unavailable: ${item.error}`));
                    continue;
                }
            }
            if (item.intent === 'setup' && typeof item.ext?.prompts === 'function') {
                const promptDefs = item.ext.prompts(new Tree(projectRoot)) ?? [];
                for (const promptDef of promptDefs) {
                    const answer = await prompts(getPromptOption(promptDef, item.options), { onCancel });
                    if (cancelled) throw new Error('cancelled');
                    item.options[promptDef.field] = answer[promptDef.field];
                }
            }
        }
    }
}
