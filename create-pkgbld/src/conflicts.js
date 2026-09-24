/**
 * Format conflicts for printing. Returns lines with a leading marker.
 * @param {readonly import('./project-changes.js').Conflict[]} conflicts
 * @returns {string[]}
 */
export function formatConflicts(conflicts) {
    return conflicts.map(conflict => {
        const source = `(from: ${[...new Set(conflict.sources)].join(', ')})`;
        if (conflict.kind !== 'migration-conflict') return `  ⚠ ${conflict.message} ${source}`;
        return `  ⚠ ${conflict.message}; expected ${formatValue(conflict.expected)}, found ${formatValue(
            conflict.current
        )}, proposed ${formatValue(conflict.proposed)} ${source}`;
    });
}

/** @param {unknown} value */
function formatValue(value) {
    if (value === undefined) return '<absent>';
    const json = JSON.stringify(value);
    return json && json.length > 120 ? `${json.slice(0, 117)}...` : (json ?? String(value));
}
