import prompts from 'prompts';

import { blue, gray, green, red } from '@niceties/ansi';

/**
 * @typedef {import('prompts').PromptObject} PromptObject
 * @typedef {import('./types.js').Option} Option
 * @typedef {import('./types.js').OptionsValue} OptionsValue
 * @typedef {{
 *   operation: import('./package-operations.js').PreparedPackageOperation,
 *   answers: OptionsValue
 * }} PendingPackageOperation
 */

export const done = Symbol('done');
const PACKAGE_PREFIX = '__package__:';

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
 * @param {OptionsValue} answers
 * @returns {PromptObject}
 */
export function getPromptOption(option, answers) {
    const value = answers[option.field];
    const initialValue = value ?? option.initialValue;
    const type = option.type ?? 'text';
    /** @type {PromptObject} */
    const promptOption = {
        type,
        name: option.field,
        message: option.title,
        initial: /** @type {any} */ (Array.isArray(initialValue) ? initialValue.join(',') : (initialValue ?? '')),
    };
    if (type === 'multiselect') {
        promptOption.choices =
            'list' in option
                ? option.list.map((/** @type {string} */ item) => ({
                      title: item,
                      value: item,
                      selected: Array.isArray(initialValue) && initialValue.includes(item),
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
 * @param {import('./package-operations.js').PackageView} item
 * @param {PendingPackageOperation | undefined} pending
 */
function renderPackageLabel(item, pending) {
    const left = pad16plus(item.name);
    if (pending) return `${left}${blue(`[Pending ${pending.operation.effect}]`)}`;
    if (item.state === 'unavailable') return `${left}${red('[Unavailable]')} ${gray(item.error ?? '')}`;
    if (item.state === 'available') return `${left}${gray('[Available]')}`;
    if (item.state === 'applied') return `${left}${blue('[Applied]')}`;
    if (item.state === 'installed-managed') return `${left}${green('[Installed, managed]')}`;
    return `${left}${blue('[Installed, unmanaged]')}`;
}

/**
 * Collect package targets and their answers. Project changes remain unstaged
 * until the caller stages the returned operations.
 *
 * @param {{ packageOperations: Awaited<ReturnType<import('./package-operations.js').openPackageOperations>> }} params
 * @returns {Promise<PendingPackageOperation[]>}
 */
export async function runInteractiveLoop({ packageOperations }) {
    let cancelled = false;
    function onCancel() {
        cancelled = true;
    }
    /** @type {Map<string, PendingPackageOperation>} */
    const pending = new Map();

    for (;;) {
        const packageAction = await prompts(
            {
                type: 'select',
                name: 'value',
                message: 'Select a PKG BLD package, Done to execute, Escape to cancel',
                choices: [
                    { title: green('Done'), value: /** @type {any} */ (done) },
                    ...packageOperations.inventory.map(item => ({
                        title: renderPackageLabel(item, pending.get(item.id)),
                        value: `${PACKAGE_PREFIX}${item.id}`,
                    })),
                ],
                initial: 0,
            },
            { onCancel }
        );
        if (cancelled) throw new Error('cancelled');
        if (packageAction.value === done) return [...pending.values()];

        if (typeof packageAction.value !== 'string' || !packageAction.value.startsWith(PACKAGE_PREFIX)) continue;
        const id = packageAction.value.slice(PACKAGE_PREFIX.length);
        const item = packageOperations.inventory.find(candidate => candidate.id === id);
        if (!item) continue;
        if (pending.delete(id)) continue;
        if (item.state === 'unavailable') {
            console.log(red(`Package "${item.name}" is unavailable: ${item.error ?? 'not resolvable'}`));
            continue;
        }

        /** @type {import('./package-operations.js').PackageTarget} */
        let target;
        if (item.state === 'installed-unmanaged') {
            const action = await prompts(
                {
                    type: 'select',
                    name: 'value',
                    message: `Manage ${item.name}`,
                    choices: [
                        { title: 'Adopt', value: 'managed' },
                        { title: 'Remove', value: 'absent' },
                        { title: 'Cancel', value: null },
                    ],
                },
                { onCancel }
            );
            if (cancelled) throw new Error('cancelled');
            if (action.value === null || action.value === undefined) continue;
            target = action.value;
        } else {
            target = item.state === 'installed-managed' ? 'absent' : 'managed';
        }

        try {
            const operation = await packageOperations.prepare({ package: id, target });
            /** @type {OptionsValue} */
            const answers = {};
            for (const question of operation.questions) {
                const answer = await prompts(getPromptOption(question, answers), { onCancel });
                if (cancelled) throw new Error('cancelled');
                answers[question.field] = answer[question.field];
            }
            pending.set(id, { operation, answers });
        } catch (/** @type {any} */ error) {
            if (error.message === 'cancelled') throw error;
            console.log(red(`Package "${item.name}" is unavailable: ${error.message ?? String(error)}`));
        }
    }
}
