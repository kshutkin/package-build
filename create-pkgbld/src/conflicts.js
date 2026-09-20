/**
 * Format conflicts for printing. Returns lines with a leading marker.
 * @param {readonly import('./project-changes.js').Conflict[]} conflicts
 * @returns {string[]}
 */
export function formatConflicts(conflicts) {
    return conflicts.map(conflict => `  ⚠ ${conflict.message} (from: ${[...new Set(conflict.sources)].join(', ')})`);
}
