import prompts from 'prompts';

import { blue, gray, green, red, white } from '@niceties/ansi';

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
const SEP_VALUE = '__sep__';
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
 * Reduce an Option tree into its default OptionsValue snapshot.
 *
 * @param {Option[]} options
 * @returns {OptionsValue}
 */
export function getOptionsValue(options) {
    /** @type {OptionsValue} */
    const result = {};
    for (const item of options) {
        if ('items' in item) {
            const value = getOptionsValue(item.items);
            if (item.mutateInnerObject) {
                result[item.field] = value;
            } else {
                Object.assign(result, value);
            }
        } else {
            result[item.field] = item.initialValue;
        }
    }
    return result;
}

/**
 * Build the rendered string for a group option (with `items`).
 *
 * @param {{ items: Option[]; mutateInnerObject: boolean; render?: (option: Option, value: OptionsValue) => string; }} option
 * @param {OptionsValue} json
 * @returns {string}
 */
export function getPrintString(option, json) {
    if (option.render) {
        return option.render(/** @type {Option} */ (option), json);
    }
    return option.items
        .filter(
            item =>
                item.field in json &&
                json[item.field] &&
                (Array.isArray(json[item.field]) ? /** @type {unknown[]} */ (/** @type {unknown} */ (json[item.field])).length > 0 : true)
        )
        .map(
            item =>
                `${gray(item.title)} ${white(
                    'items' in item
                        ? `[${getPrintString(item, item.mutateInnerObject ? /** @type {OptionsValue} */ (json[item.field]) : json)}]`
                        : /** @type {string} */ (json[item.field])
                )}`
        )
        .join(', ');
}

/**
 * Build a `mapOption`-style choice mapper for a top-level option list bound to `state`.
 *
 * @param {OptionsValue} state
 */
export function mapOption(state) {
    return (/** @type {Option} */ option) => {
        const fieldValue = state[option.field];
        return {
            title:
                pad16plus(option.title) +
                gray(
                    'items' in option
                        ? getPrintString(
                              option,
                              option.mutateInnerObject
                                  ? /** @type {Record<string, string>} */ (fieldValue)
                                  : /** @type {Record<string, string>} */ (state)
                          )
                        : /** @type {string} */ (fieldValue ?? '')
                ),
            value: option.field,
        };
    };
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
 * Drive the interactive top-level menu loop. Mutates `state` and
 * `extensionItems` (intents + collected options) in place. Returns when the
 * user picks Done. Throws if the user cancels.
 *
 * @param {{
 *   options: Option[],
 *   state: OptionsValue,
 *   extensionItems: ExtensionMenuItem[],
 *   mode: 'create' | 'update',
 *   projectRoot: string
 * }} params
 */
export async function runInteractiveLoop({ options, state, extensionItems, mode, projectRoot }) {
    let cancelled = false;
    function onCancel() {
        cancelled = true;
    }

    for (;;) {
        /** @type {import('prompts').Choice[]} */
        const choices = [
            { title: green('Done'), description: `${mode === 'update' ? 'Update' : 'Create'} package`, value: /** @type {any} */ (done) },
            ...options.map(mapOption(state)),
        ];
        if (extensionItems.length > 0) {
            choices.push({ title: gray('── Extensions ──'), value: SEP_VALUE, disabled: true });
            for (const item of extensionItems) {
                choices.push({ title: renderExtensionLabel(item), value: `${EXT_PREFIX}${item.entry.name}` });
            }
        }

        const topLevelAction = await prompts(
            {
                type: 'select',
                name: 'value',
                message: 'Select an option to change, Done to execute, Escape to cancel',
                choices,
                initial: 0,
            },
            { onCancel }
        );
        if (cancelled) throw new Error('cancelled');

        if (topLevelAction.value === done) return;
        if (topLevelAction.value === SEP_VALUE) continue;

        if (typeof topLevelAction.value === 'string' && topLevelAction.value.startsWith(EXT_PREFIX)) {
            const name = topLevelAction.value.slice(EXT_PREFIX.length);
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
                    if ('items' in promptDef) continue;
                    const answer = await prompts(getPromptOption(promptDef, item.options), { onCancel });
                    if (cancelled) throw new Error('cancelled');
                    item.options[promptDef.field] = answer[promptDef.field];
                }
            }
            continue;
        }

        let option = /** @type {Option} */ (options.find(it => it.field === topLevelAction.value));
        let mutateObject = state;
        while ('items' in option) {
            const nextLevelAction = await prompts(
                {
                    type: 'select',
                    name: 'value',
                    message: option.title,
                    choices: option.items.map(
                        mapOption(option.mutateInnerObject ? /** @type {Record<string, string>} */ (state[option.field]) : state)
                    ),
                },
                { onCancel }
            );
            if (cancelled) throw new Error('cancelled');
            if (option.mutateInnerObject) {
                mutateObject = /** @type {Record<string, string>} */ (state[option.field]);
            }
            option = /** @type {Option} */ (option.items.find((/** @type {Option} */ it) => it.field === nextLevelAction.value));
        }

        const action = await prompts(getPromptOption(option, mutateObject), { onCancel });
        if (cancelled) throw new Error('cancelled');
        mutateObject[option.field] = action[option.field];
    }
}
