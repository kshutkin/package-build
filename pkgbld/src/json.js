import path from 'node:path';

import { applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser';

import { toFormattedJson } from './options/index.js';

/** @param {string} filePath */
export function isJsoncFile(filePath) {
    const normalized = filePath.replaceAll('\\', '/');
    const name = path.posix.basename(normalized);
    return (
        name.endsWith('.jsonc') ||
        /^(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json$/.test(name) ||
        name === '.swcrc' ||
        /(?:^|\/)(?:\.vscode|\.cursor|\.zed)\/.*\.json$/.test(normalized)
    );
}

/**
 * Parse JSON or JSONC, rejecting syntax errors instead of accepting partial results.
 * @param {string} text
 * @param {boolean} [jsonc]
 * @returns {any}
 */
export function parseJson(text, jsonc = false) {
    /** @type {import('jsonc-parser').ParseError[]} */
    const errors = [];
    const result = parse(text, errors, { disallowComments: !jsonc, allowTrailingComma: jsonc });
    if (errors.length > 0) {
        throw new SyntaxError(`${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`);
    }
    return result;
}

/**
 * Edit changed values in place, retaining comments and formatting outside the edits.
 * An optional resolved original applies only hook changes to an authored config.
 * @param {any} json
 * @param {string | null} [current]
 * @param {any} [original]
 * @returns {string}
 */
export function toFormattedJsonc(json, current, original) {
    const next = JSON.parse(JSON.stringify(json));
    if (current == null) return toFormattedJson(next);
    const authored = parseJson(current, true);
    const before = original === undefined ? authored : JSON.parse(JSON.stringify(original));
    const indent = current.match(/^[ \t]+(?=\S)/m)?.[0] ?? '  ';
    const formattingOptions = {
        insertSpaces: !indent.includes('\t'),
        tabSize: indent.includes('\t') ? 4 : indent.length,
        eol: current.includes('\r\n') ? '\r\n' : '\n',
    };
    let text = current;
    edit([], before, next);
    return text;

    /** @param {(string | number)[]} location @param {any} beforeValue @param {any} afterValue */
    function edit(location, beforeValue, afterValue) {
        if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
            const common = Math.min(beforeValue.length, afterValue.length);
            for (let index = 0; index < common; index++) edit([...location, index], beforeValue[index], afterValue[index]);
            for (let index = beforeValue.length - 1; index >= afterValue.length; index--) replace([...location, index], undefined);
            for (let index = common; index < afterValue.length; index++) replace([...location, index], afterValue[index]);
        } else if (isObject(beforeValue) && isObject(afterValue)) {
            for (const key of Object.keys(beforeValue)) {
                if (!Object.hasOwn(afterValue, key)) replace([...location, key], undefined);
            }
            for (const key of Object.keys(afterValue)) {
                if (Object.hasOwn(beforeValue, key)) edit([...location, key], beforeValue[key], afterValue[key]);
                else replace([...location, key], afterValue[key]);
            }
        } else if (beforeValue !== afterValue) {
            replace(location, afterValue);
        }
    }

    /** @param {(string | number)[]} location @param {any} value */
    function replace(location, value) {
        text = applyEdits(text, modify(text, location, value, { formattingOptions }));
    }
}

/** @param {any} value @returns {value is Record<string, any>} */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
