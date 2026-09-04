import prompts from 'prompts';

import { blue, gray, green, red } from '@niceties/ansi';

import { detectExtension } from './engine.js';
import { resolveExtension } from './registry.js';
import { Tree } from './tree.js';

/**
 * @typedef {import('prompts').PromptObject} PromptObject
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 * @typedef {import('./registry.js').ExtensionEntry} ExtensionEntry
 * @typedef {import('./registry.js').Extension} Extension
 *
 * @typedef {{
 *   entry: ExtensionEntry,
 *   ext: Extension | null,
 *   error: string | null,
 *   installed: boolean,
 *   intent: null | 'setup' | 'remove',
 *   options: OptionsValue
 * }} ExtensionMenuItem
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
 * Resolve every registry entry and compute its current install status against
 * a fresh Tree. Entries that fail to resolve are returned with `ext=null` and
 * an `error` message so the menu can render them as unavailable.
 *
 * @param {ExtensionEntry[]} registry
 * @param {string} projectRoot
 * @returns {Promise<ExtensionMenuItem[]>}
 */
export async function buildExtensionMenuItems(registry, projectRoot) {
    /** @type {ExtensionMenuItem[]} */
    const result = [];
    for (const entry of registry) {
        try {
            const ext = await resolveExtension(entry, projectRoot);
            const tree = new Tree(projectRoot);
            const installed = detectExtension(ext, tree);
            result.push({ entry, ext, error: null, installed, intent: null, options: {} });
        } catch (/** @type {any} */ err) {
            result.push({
                entry,
                ext: null,
                error: /** @type {string} */ (err.message ?? String(err)),
                installed: false,
                intent: null,
                options: {},
            });
        }
    }
    return result;
}

/**
 * Render one extension menu item label.
 *
 * @param {ExtensionMenuItem} item
 */
function renderExtensionLabel(item) {
    const left = pad16plus(item.entry.name);
    if (item.error) {
        return `${left}${red('[Unavailable]')} ${gray(item.error)}`;
    }
    if (item.intent === 'setup') {
        return `${left}${blue('[Pending setup]')}`;
    }
    if (item.intent === 'remove') {
        return `${left}${blue('[Pending remove]')}`;
    }
    return `${left}${item.installed ? green('[Installed]') : gray('[Not installed]')}`;
}

/**
 * Toggle pending intent for an extension menu item. Mirrors the spec:
 *   - if there's already a pending intent → clear it
 *   - else if currently installed → mark for remove
 *   - else → mark for setup
 *
 * @param {ExtensionMenuItem} item
 */
export function toggleExtensionIntent(item) {
    if (item.intent !== null) {
        item.intent = null;
        item.options = {};
        return;
    }
    item.intent = item.installed ? 'remove' : 'setup';
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
                message: 'Select a plugin to add or remove, Done to execute, Escape to cancel',
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
            if (item.error || !item.ext) {
                console.log(red(`Extension "${name}" is unavailable: ${item.error ?? 'not resolvable'}`));
                continue;
            }
            toggleExtensionIntent(item);
            if (item.intent === 'setup' && typeof item.ext.prompts === 'function') {
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
