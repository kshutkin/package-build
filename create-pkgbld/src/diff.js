import { blue, gray, green, red, white, yellow } from '@niceties/ansi';

/**
 * @typedef {import('./tree.js').FileChange} FileChange
 */

/**
 * Render an accumulated set of FileChanges as a colored, file-by-file diff
 * suitable for printing before commit (or for --dry-run output).
 *
 * Pure: returns a string with no trailing newline; the caller decides
 * whether to wrap with headers or pipe through console.log.
 *
 * @param {FileChange[]} changes
 * @param {{ projectRoot?: string, readDiskJson?: (path: string) => any | null }} [opts]
 * @returns {string}
 */
export function renderChanges(changes, opts = {}) {
    if (changes.length === 0) return gray('  (no changes)');
    const lines = [];
    for (const c of changes) {
        const tag = c.type === 'CREATE' ? green('CREATE') : c.type === 'UPDATE' ? yellow('UPDATE') : red('DELETE');
        lines.push(`  ${tag}  ${white(c.path)}`);
        if (c.type === 'UPDATE' && c.path.endsWith('package.json') && typeof c.content === 'string') {
            const before = opts.readDiskJson?.(c.path) ?? null;
            const after = safeParseJson(c.content);
            if (before && after) {
                const keyLines = describePackageJsonDiff(before, after);
                for (const kl of keyLines) lines.push(`         ${kl}`);
            }
        } else if (c.type === 'DELETE') {
            lines.push(`         ${gray('(file removed)')}`);
        }
    }
    return lines.join('\n');
}

/**
 * @param {string} text
 */
function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const PKG_GROUPS = ['dependencies', 'devDependencies', 'peerDependencies', 'scripts'];

/**
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @returns {string[]}
 */
function describePackageJsonDiff(before, after) {
    /** @type {string[]} */
    const out = [];
    for (const group of PKG_GROUPS) {
        const b = before[group] ?? {};
        const a = after[group] ?? {};
        const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
        for (const k of keys) {
            if (b[k] === a[k]) continue;
            if (!(k in b)) {
                out.push(`${green('+')} ${gray(group)}.${white(k)} ${gray('=')} ${green(String(a[k]))}`);
            } else if (!(k in a)) {
                out.push(`${red('-')} ${gray(group)}.${white(k)}`);
            } else {
                out.push(`${blue('~')} ${gray(group)}.${white(k)} ${gray(String(b[k]))} ${gray('→')} ${white(String(a[k]))}`);
            }
        }
    }
    const topKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of topKeys) {
        if (PKG_GROUPS.includes(k)) continue;
        if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
        if (!(k in before)) out.push(`${green('+')} ${white(k)}`);
        else if (!(k in after)) out.push(`${red('-')} ${white(k)}`);
        else out.push(`${blue('~')} ${white(k)}`);
    }
    return out;
}
