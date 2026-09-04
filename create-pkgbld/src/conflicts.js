import path from 'node:path';

/**
 * Detect conflicts inside a set of pending operations recorded against a Tree.
 *
 * The conflict model intentionally inspects the *operations* that extensions
 * issued (not just final FileChanges) so that we can spot two extensions
 * setting the same script to different values, or adding the same dependency
 * at different versions — information that would otherwise be lost once the
 * tree has been collapsed into final JSON.
 *
 * @typedef {{
 *   kind: 'write-conflict' | 'write-vs-delete' | 'dependency-version' | 'script-value',
 *   path?: string,
 *   key?: string,
 *   sources: string[],
 *   message: string
 * }} Conflict
 *
 * @typedef {{
 *   source: string,
 *   kind: 'write' | 'delete' | 'dependency' | 'script',
 *   path?: string,
 *   key?: string,
 *   value?: string
 * }} RecordedOp
 */

/**
 * @param {RecordedOp[]} ops
 * @returns {Conflict[]}
 */
export function detectConflicts(ops) {
    /** @type {Conflict[]} */
    const conflicts = [];

    /** @type {Map<string, { source: string, value: string }[]>} */
    const fileWrites = new Map();
    /** @type {Map<string, string[]>} */
    const fileDeletes = new Map();
    /** @type {Map<string, { source: string, value: string }[]>} */
    const deps = new Map();
    /** @type {Map<string, { source: string, value: string }[]>} */
    const scripts = new Map();

    for (const op of ops) {
        if (op.kind === 'write' && op.path) {
            const list = fileWrites.get(op.path) ?? [];
            list.push({ source: op.source, value: op.value ?? '' });
            fileWrites.set(op.path, list);
        } else if (op.kind === 'delete' && op.path) {
            const list = fileDeletes.get(op.path) ?? [];
            list.push(op.source);
            fileDeletes.set(op.path, list);
        } else if (op.kind === 'dependency' && op.key) {
            const list = deps.get(op.key) ?? [];
            list.push({ source: op.source, value: op.value ?? '' });
            deps.set(op.key, list);
        } else if (op.kind === 'script' && op.key) {
            const list = scripts.get(op.key) ?? [];
            list.push({ source: op.source, value: op.value ?? '' });
            scripts.set(op.key, list);
        }
    }

    for (const [path, writes] of fileWrites) {
        const distinct = new Set(writes.map(w => w.value));
        if (writes.length > 1 && distinct.size > 1) {
            conflicts.push({
                kind: 'write-conflict',
                path,
                sources: writes.map(w => w.source),
                message: `Multiple extensions write different content to "${path}"`,
            });
        }
        if (fileDeletes.has(path)) {
            conflicts.push({
                kind: 'write-vs-delete',
                path,
                sources: [...new Set([...writes.map(w => w.source), .../** @type {string[]} */ (fileDeletes.get(path))])],
                message: `"${path}" is both written and deleted in the same run`,
            });
        }
    }

    for (const [key, entries] of deps) {
        const distinct = new Set(entries.map(e => e.value));
        if (distinct.size > 1) {
            conflicts.push({
                kind: 'dependency-version',
                key,
                sources: entries.map(e => e.source),
                message: `Dependency "${key}" requested at different versions: ${[...distinct].join(', ')}`,
            });
        }
    }

    for (const [key, entries] of scripts) {
        const distinct = new Set(entries.map(e => e.value));
        if (distinct.size > 1) {
            conflicts.push({
                kind: 'script-value',
                key,
                sources: entries.map(e => e.source),
                message: `Script "${key}" set to different commands: ${[...distinct].join(' | ')}`,
            });
        }
    }

    return conflicts;
}

/**
 * Run a synchronous block while recording operations against a Tree.
 * Returns the collected ops. Restores original Tree methods on completion.
 *
 * @template T
 * @param {import('./tree.js').Tree} tree
 * @param {string} source - label identifying the extension issuing the ops
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<{ result: T, ops: RecordedOp[] }>}
 */
export async function recordOps(tree, source, fn) {
    /** @type {RecordedOp[]} */
    const ops = [];
    const origWrite = tree.write.bind(tree);
    const origDelete = tree.delete.bind(tree);
    const origAddDep = tree.addDependency.bind(tree);
    const origAddScript = tree.addScript.bind(tree);
    /** @type {any} */
    const t = tree;
    t.write = (/** @type {string} */ p, /** @type {string} */ content) => {
        // package.json is rewritten by addDependency/addScript helpers; granular
        // dependency/script ops capture the real intent, so we skip raw writes
        // here to avoid double-counting.
        if (path.basename(p) !== 'package.json') {
            ops.push({ source, kind: 'write', path: p, value: content });
        }
        return origWrite(p, content);
    };
    t.delete = (/** @type {string} */ p) => {
        ops.push({ source, kind: 'delete', path: p });
        return origDelete(p);
    };
    t.addDependency = (
        /** @type {string} */ name,
        /** @type {string} */ version,
        /** @type {'dependencies' | 'devDependencies'} */ type
    ) => {
        ops.push({ source, kind: 'dependency', key: name, value: version });
        return origAddDep(name, version, type);
    };
    t.addScript = (/** @type {string} */ name, /** @type {string} */ command) => {
        ops.push({ source, kind: 'script', key: name, value: command });
        return origAddScript(name, command);
    };
    try {
        const result = await fn();
        return { result, ops };
    } finally {
        t.write = origWrite;
        t.delete = origDelete;
        t.addDependency = origAddDep;
        t.addScript = origAddScript;
    }
}

/**
 * Format conflicts for printing. Returns lines with a leading marker.
 * @param {Conflict[]} conflicts
 * @returns {string[]}
 */
export function formatConflicts(conflicts) {
    return conflicts.map(c => `  ⚠ ${c.message} (from: ${[...new Set(c.sources)].join(', ')})`);
}
