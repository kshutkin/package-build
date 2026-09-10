import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { toFormattedJson } from 'pkgbld/options';

/**
 * @typedef {'CREATE' | 'UPDATE' | 'DELETE'} ChangeAction
 * @typedef {{ path: string, type: ChangeAction, content?: string }} FileChange
 * @typedef {{ content: string | null, action: ChangeAction | null }} Entry
 */

export class Tree {
    /**
     * @param {string} projectRoot
     */
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        /** @type {Map<string, Entry>} */
        this.entries = new Map();
        /** @type {string | null} */
        this.extensionBase = null;
    }

    /**
     * Set the base directory used to resolve extension-relative file paths.
     * @param {string | null} dir
     */
    setExtensionBase(dir) {
        this.extensionBase = dir;
    }

    /**
     * @param {string} p
     */
    _abs(p) {
        const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(this.projectRoot, p);
        const rel = path.relative(this.projectRoot, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new Error(`Path escapes project root: ${p}`);
        }
        return abs;
    }

    /**
     * @param {string} p
     */
    _key(p) {
        this._abs(p);
        return path.normalize(p);
    }

    /**
     * @param {string} p
     */
    _loadFromDisk(p) {
        try {
            return readFileSync(this._abs(p), 'utf8');
        } catch {
            return null;
        }
    }

    /**
     * @param {string} p
     * @returns {string | null}
     */
    read(p) {
        const key = this._key(p);
        const cached = this.entries.get(key);
        if (cached !== undefined) {
            if (cached.action === 'DELETE') return null;
            return cached.content;
        }
        const content = this._loadFromDisk(key);
        this.entries.set(key, { content, action: null });
        return content;
    }

    /**
     * @param {string} p
     * @param {string} content
     */
    write(p, content) {
        const key = this._key(p);
        const existing = this.entries.get(key);
        /** @type {ChangeAction} */
        let action;
        if (existing) {
            if (existing.action === 'CREATE') {
                action = 'CREATE';
            } else if (existing.action === 'DELETE') {
                action = 'UPDATE';
            } else if (existing.content === null) {
                action = 'CREATE';
            } else {
                action = 'UPDATE';
            }
        } else {
            const diskContent = this._loadFromDisk(key);
            action = diskContent === null ? 'CREATE' : 'UPDATE';
        }
        this.entries.set(key, { content, action });
    }

    /**
     * @param {string} p
     */
    exists(p) {
        return this.read(p) !== null;
    }

    /**
     * @param {string} p
     */
    delete(p) {
        const key = this._key(p);
        const cached = this.entries.get(key);
        if (cached) {
            if (cached.action === 'CREATE') {
                this.entries.delete(key);
                return;
            }
            if (cached.content === null) {
                // already known to not exist (read miss or prior DELETE)
                return;
            }
        } else if (this._loadFromDisk(key) === null) {
            return;
        }
        this.entries.set(key, { content: null, action: 'DELETE' });
    }

    /**
     * @param {string} oldPath
     * @param {string} newPath
     */
    rename(oldPath, newPath) {
        const content = this.read(oldPath);
        if (content === null) return;
        this.delete(oldPath);
        this.write(newPath, content);
    }

    /**
     * @param {string} p
     * @returns {any | null}
     */
    readJson(p) {
        const content = this.read(p);
        if (content === null) return null;
        return JSON.parse(content);
    }

    /**
     * @param {string} p
     * @param {(data: any) => any} updater
     */
    updateJson(p, updater) {
        const current = this.read(p);
        const data = current === null ? {} : JSON.parse(current);
        const updated = updater(data) ?? data;
        const isPkgJson = path.basename(this._key(p)) === 'package.json';
        const formatted = isPkgJson ? toFormattedJson(updated) : `${JSON.stringify(updated, null, 2)}\n`;
        if (formatted === current) return;
        this.write(p, formatted);
    }

    /**
     * @param {string} name
     * @param {string} version
     * @param {'dependencies' | 'devDependencies'} [type]
     */
    addDependency(name, version, type = 'dependencies') {
        this.updateJson('package.json', pkg => {
            pkg[type] ??= {};
            pkg[type][name] = version;
            return pkg;
        });
    }

    /**
     * @param {string} name
     * @param {'dependencies' | 'devDependencies'} [type]
     */
    removeDependency(name, type = 'dependencies') {
        this.updateJson('package.json', pkg => {
            if (pkg[type] && name in pkg[type]) {
                delete pkg[type][name];
                if (Object.keys(pkg[type]).length === 0) delete pkg[type];
            }
            return pkg;
        });
    }

    /**
     * @param {string} name
     * @param {string} command
     */
    addScript(name, command) {
        this.updateJson('package.json', pkg => {
            pkg.scripts ??= {};
            pkg.scripts[name] = command;
            return pkg;
        });
    }

    /**
     * @param {string} name
     */
    removeScript(name) {
        this.updateJson('package.json', pkg => {
            if (pkg.scripts && name in pkg.scripts) {
                delete pkg.scripts[name];
                if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
            }
            return pkg;
        });
    }

    /**
     * @param {string} relativePath
     */
    resolveExtensionFile(relativePath) {
        if (!this.extensionBase) {
            throw new Error('Tree.resolveExtensionFile: extension base directory is not set');
        }
        return path.resolve(this.extensionBase, relativePath);
    }

    /**
     * @returns {FileChange[]}
     */
    listChanges() {
        /** @type {FileChange[]} */
        const result = [];
        for (const [p, entry] of this.entries) {
            if (entry.action === null) continue;
            /** @type {FileChange} */
            const change = { path: p, type: entry.action };
            if (entry.action !== 'DELETE' && entry.content !== null) {
                change.content = entry.content;
            }
            result.push(change);
        }
        result.sort((a, b) => a.path.localeCompare(b.path));
        return result;
    }

    async commit() {
        const changes = this.listChanges();
        for (const change of changes) {
            const abs = this._abs(change.path);
            if (change.type === 'DELETE') {
                try {
                    await fs.unlink(abs);
                } catch (/** @type {any} */ err) {
                    if (err.code !== 'ENOENT') throw err;
                }
                continue;
            }
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, change.content ?? '', 'utf8');
        }
    }
}
