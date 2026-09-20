import path from 'node:path';

import { LOCK_FILE, removeLockedPackage, setLockedPackage } from './project-lock.js';
import { Tree } from './tree.js';

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * @typedef {{
 *   kind: 'file' | 'dependency' | 'script' | 'package-json',
 *   resource: string,
 *   source: string,
 *   path?: string,
 *   key?: string,
 *   value: unknown,
 *   fingerprint: string
 * }} ChangeClaim
 * @typedef {{
 *   kind: 'write-conflict' | 'write-vs-delete' | 'dependency-version' | 'script-value' | 'package-json-value' | 'migration-conflict',
 *   path?: string,
 *   key?: string,
 *   sources: readonly string[],
 *   message: string,
 *   resource?: string,
 *   expected?: unknown,
 *   current?: unknown,
 *   proposed?: unknown
 * }} Conflict
 */

export class ProjectChanges {
    #tree;

    /** @param {string} projectRoot */
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.#tree = new Tree(projectRoot, { onMutation: mutation => this._recordMutation(mutation) });
        /** @type {{ source: string, touched: Map<string, { before: string | null, after: string | null }>, conflicts: Conflict[] } | null} */
        this.activeStage = null;
        this.bookkeepingDepth = 0;
        /** @type {ChangeClaim[]} */
        this.claims = [];
        /** @type {Conflict[]} */
        this.migrationConflicts = [];
    }

    /**
     * Stage unattributed project changes, such as package initialization.
     * @template T
     * @param {(tree: Tree) => T} fn
     * @returns {T}
     */
    edit(fn) {
        if (this.activeStage) throw new Error('Cannot edit project changes while a package operation is active');
        const checkpoint = this.#tree._createCheckpoint();
        const scope = new ScopedTree(this.#tree);
        try {
            return fn(/** @type {Tree} */ (scope));
        } catch (error) {
            this.#tree._restoreCheckpoint(checkpoint);
            throw error;
        } finally {
            scope.close();
        }
    }

    /**
     * Stage one package operation against the accumulated project state.
     * @template T
     * @param {string} source
     * @param {(scope: { tree: Tree, projectLock: { set(packageName: string, version: string): void, remove(packageName: string): void }, reportConflict(conflict: { resource: string, message: string, expected?: unknown, current?: unknown, proposed?: unknown }): void }) => T | Promise<T>} fn
     * @returns {Promise<T>}
     */
    async stagePackageOperation(source, fn) {
        if (!source) throw new TypeError('Package operation source must not be empty');
        if (this.activeStage) throw new Error('A package operation is already active');

        const checkpoint = this.#tree._createCheckpoint();
        const scope = new ScopedTree(this.#tree);
        this.activeStage = { source, touched: new Map(), conflicts: [] };
        let stageOpen = true;
        const assertStageOpen = () => {
            if (!stageOpen) throw new Error('Project-lock scope is closed');
        };
        const projectLock = Object.freeze({
            set: (/** @type {string} */ packageName, /** @type {string} */ version) => {
                assertStageOpen();
                this._recordBookkeeping(() => setLockedPackage(this.#tree, packageName, version));
            },
            remove: (/** @type {string} */ packageName) => {
                assertStageOpen();
                this._recordBookkeeping(() => removeLockedPackage(this.#tree, packageName));
            },
        });
        const reportConflict = (/** @type {{ resource: string, message: string, expected?: unknown, current?: unknown, proposed?: unknown }} */ conflict) => {
            assertStageOpen();
            if (!conflict.resource || !conflict.message) throw new TypeError('Migration conflicts require a resource and message');
            this.activeStage?.conflicts.push({ kind: 'migration-conflict', sources: [source], ...conflict });
        };

        try {
            const result = await fn({ tree: /** @type {Tree} */ (scope), projectLock, reportConflict });
            for (const [changedPath, change] of this.activeStage.touched) {
                this.claims.push(...classifyChange(source, changedPath, change.before, change.after, this.projectRoot));
            }
            this.migrationConflicts.push(...this.activeStage.conflicts);
            return result;
        } catch (error) {
            this.#tree._restoreCheckpoint(checkpoint);
            throw error;
        } finally {
            stageOpen = false;
            scope.close();
            this.activeStage = null;
        }
    }

    review() {
        const changes = Object.freeze(this.#tree.listChanges().map(change => Object.freeze({ ...change })));
        const conflicts = Object.freeze(
            [...listConflicts(this.claims), ...this.migrationConflicts].map(conflict =>
                Object.freeze({ ...conflict, sources: Object.freeze(conflict.sources) })
            )
        );
        return Object.freeze({ changes, conflicts });
    }

    /** @param {{ lock?: 'include' | 'exclude' | 'only' }} [options] */
    async commit(options) {
        if (this.activeStage) throw new Error('Cannot commit while a package operation is active');
        await this.#tree.commit(options);
    }

    /** @param {{ path: string, before: string | null, after: string | null }} mutation */
    _recordMutation(mutation) {
        if (!this.activeStage || this.bookkeepingDepth > 0) return;
        const existing = this.activeStage.touched.get(mutation.path);
        this.activeStage.touched.set(mutation.path, {
            before: existing ? existing.before : mutation.before,
            after: mutation.after,
        });
    }

    /** @template T @param {() => T} fn @returns {T} */
    _recordBookkeeping(fn) {
        this.bookkeepingDepth += 1;
        try {
            return fn();
        } finally {
            this.bookkeepingDepth -= 1;
        }
    }
}

class ScopedTree extends Tree {
    #delegate;
    #closed = false;

    /** @param {Tree} tree */
    constructor(tree) {
        super(tree.projectRoot);
        this.#delegate = tree;
    }

    close() {
        this.#closed = true;
    }

    _assertOpen() {
        if (this.#closed) throw new Error('Tree scope is closed');
    }

    /** @param {string} value */
    _assertMutablePath(value) {
        const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(this.projectRoot, value);
        if (resolved === path.join(this.projectRoot, LOCK_FILE)) {
            throw new Error('The project lock can only be changed through the package-operation lock capability');
        }
    }

    /** @param {string | null} dir */
    setExtensionBase(dir) {
        this._assertOpen();
        this.#delegate.setExtensionBase(dir);
    }

    /** @param {string} value */
    read(value) {
        this._assertOpen();
        return this.#delegate.read(value);
    }

    /** @param {string} value @param {string} content */
    write(value, content) {
        this._assertOpen();
        this._assertMutablePath(value);
        return this.#delegate.write(value, content);
    }

    /** @param {string} value */
    delete(value) {
        this._assertOpen();
        this._assertMutablePath(value);
        return this.#delegate.delete(value);
    }

    /** @param {string} oldPath @param {string} newPath */
    rename(oldPath, newPath) {
        this._assertOpen();
        this._assertMutablePath(oldPath);
        this._assertMutablePath(newPath);
        return this.#delegate.rename(oldPath, newPath);
    }

    /** @param {string} relativePath */
    resolveExtensionFile(relativePath) {
        this._assertOpen();
        return this.#delegate.resolveExtensionFile(relativePath);
    }

    listChanges() {
        this._assertOpen();
        return this.#delegate.listChanges();
    }

    async commit() {
        this._assertOpen();
        throw new Error('Tree.commit() is unavailable inside a project change scope');
    }
}

/** @param {string} source @param {string} changedPath @param {string | null} before @param {string | null} after @param {string} root */
function classifyChange(source, changedPath, before, after, root) {
    if (before === after) return [];
    const absolute = path.isAbsolute(changedPath) ? path.resolve(changedPath) : path.resolve(root, changedPath);
    if (absolute !== path.join(root, 'package.json')) {
        return [createClaim('file', `file:${absolute}`, source, after, { path: changedPath })];
    }

    const beforeJson = parsePackageJson(before);
    const afterJson = parsePackageJson(after);
    if (!beforeJson || !afterJson) {
        return [createClaim('file', `file:${absolute}`, source, after, { path: changedPath })];
    }

    /** @type {ChangeClaim[]} */
    const claims = [];
    const dependencyNames = new Set();
    for (const field of DEPENDENCY_FIELDS) {
        for (const name of Object.keys(beforeJson[field] ?? {})) dependencyNames.add(name);
        for (const name of Object.keys(afterJson[field] ?? {})) dependencyNames.add(name);
    }
    for (const name of dependencyNames) {
        const beforeValue = dependencyPlacements(beforeJson, name);
        const afterValue = dependencyPlacements(afterJson, name);
        if (!sameValue(beforeValue, afterValue)) {
            claims.push(
                createClaim('dependency', `dependency:${name}`, source, afterValue.length > 0 ? afterValue : undefined, { key: name })
            );
        }
    }

    for (const name of new Set([...Object.keys(beforeJson.scripts ?? {}), ...Object.keys(afterJson.scripts ?? {})])) {
        const beforeValue = beforeJson.scripts?.[name];
        const afterValue = afterJson.scripts?.[name];
        if (!sameValue(beforeValue, afterValue)) {
            claims.push(createClaim('script', `script:${name}`, source, afterValue, { key: name }));
        }
    }

    const ignored = new Set([...DEPENDENCY_FIELDS, 'scripts']);
    for (const key of new Set([...Object.keys(beforeJson), ...Object.keys(afterJson)])) {
        if (ignored.has(key)) continue;
        const beforeValue = beforeJson[key];
        const afterValue = afterJson[key];
        if (!sameValue(beforeValue, afterValue)) {
            claims.push(createClaim('package-json', `package-json:${key}`, source, afterValue, { key }));
        }
    }
    return claims;
}

/** @param {string | null} value */
function parsePackageJson(value) {
    if (value === null) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** @param {Record<string, any>} pkg @param {string} name */
function dependencyPlacements(pkg, name) {
    return DEPENDENCY_FIELDS.flatMap(field => (pkg[field]?.[name] === undefined ? [] : [{ field, version: pkg[field][name] }]));
}

/** @param {ChangeClaim['kind']} kind @param {string} resource @param {string} source @param {unknown} value @param {{ path?: string, key?: string }} location */
function createClaim(kind, resource, source, value, location) {
    return { kind, resource, source, value, fingerprint: fingerprint(value), ...location };
}

/** @param {unknown} left @param {unknown} right */
function sameValue(left, right) {
    return fingerprint(left) === fingerprint(right);
}

/** @param {unknown} value */
function fingerprint(value) {
    return value === undefined ? '<absent>' : JSON.stringify(canonicalize(value));
}

/** @param {unknown} value @returns {unknown} */
function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(/** @type {Record<string, unknown>} */ (value))
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)])
    );
}

/** @param {ChangeClaim[]} claims @returns {Conflict[]} */
function listConflicts(claims) {
    /** @type {Map<string, ChangeClaim[]>} */
    const groups = new Map();
    for (const claim of claims) {
        const group = groups.get(claim.resource) ?? [];
        const previous = group.findIndex(item => item.source === claim.source);
        if (previous === -1) group.push(claim);
        else group[previous] = claim;
        groups.set(claim.resource, group);
    }

    /** @type {Conflict[]} */
    const conflicts = [];
    for (const [, group] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
        if (group.length < 2 || new Set(group.map(item => item.fingerprint)).size < 2) continue;
        const first = group[0];
        const sources = group.map(item => item.source);
        if (first.kind === 'dependency') {
            conflicts.push({
                kind: 'dependency-version',
                key: first.key,
                sources,
                message: `Dependency "${first.key}" is requested with different placements or versions`,
            });
        } else if (first.kind === 'script') {
            conflicts.push({
                kind: 'script-value',
                key: first.key,
                sources,
                message: `Script "${first.key}" is set to different commands`,
            });
        } else if (first.kind === 'package-json') {
            conflicts.push({
                kind: 'package-json-value',
                key: first.key,
                sources,
                message: `package.json property "${first.key}" is set to different values`,
            });
        } else {
            const deletes = group.some(item => item.value === undefined || item.value === null);
            conflicts.push({
                kind: deletes ? 'write-vs-delete' : 'write-conflict',
                path: first.path,
                sources,
                message: deletes
                    ? `"${first.path}" is both written and deleted in the same run`
                    : `Multiple package operations write different content to "${first.path}"`,
            });
        }
    }
    return conflicts;
}
