import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');

const schema = JSON.parse(readFileSync(path.join(pkgDir, 'extensions-schema.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(pkgDir, 'extensions.json'), 'utf8'));

/**
 * Tiny ad-hoc JSON Schema validator covering exactly the subset used by
 * extensions-schema.json (type, required, properties, items, $ref to
 * `#/definitions/*`, additionalProperties:false, minLength on strings).
 * Intentionally minimal — pulling in ajv just for this would be overkill.
 *
 * @param {any} value
 * @param {any} sch
 * @param {any} root
 * @param {string[]} path
 * @returns {string[]} list of error messages (empty = ok)
 */
function validate(value, sch, root, path = []) {
    const errs = [];
    if (sch.$ref) {
        const ref = sch.$ref;
        const m = /^#\/definitions\/(.+)$/.exec(ref);
        if (!m) return [`unsupported $ref ${ref}`];
        return validate(value, root.definitions[m[1]], root, path);
    }
    const where = path.join('.') || '<root>';
    if (sch.type === 'object') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            errs.push(`${where}: expected object`);
            return errs;
        }
        for (const r of sch.required ?? []) {
            if (!(r in value)) errs.push(`${where}: missing required "${r}"`);
        }
        if (sch.additionalProperties === false && sch.properties) {
            for (const k of Object.keys(value)) {
                if (!(k in sch.properties)) errs.push(`${where}: unexpected property "${k}"`);
            }
        }
        for (const [k, propSch] of Object.entries(sch.properties ?? {})) {
            if (k in value) errs.push(...validate(value[k], propSch, root, [...path, k]));
        }
    } else if (sch.type === 'array') {
        if (!Array.isArray(value)) {
            errs.push(`${where}: expected array`);
            return errs;
        }
        if (sch.items) {
            value.forEach((v, i) => {
                errs.push(...validate(v, sch.items, root, [...path, String(i)]));
            });
        }
    } else if (sch.type === 'string') {
        if (typeof value !== 'string') errs.push(`${where}: expected string`);
        else if (sch.minLength != null && value.length < sch.minLength) errs.push(`${where}: too short`);
    }
    return errs;
}

describe('extensions-schema.json', () => {
    test('built-in extensions.json validates', () => {
        const errs = validate(registry, schema, schema);
        assert.deepStrictEqual(errs, []);
    });

    test('rejects entry missing required "package"', () => {
        const bad = { extensions: [{ name: 'x', description: 'd' }] };
        const errs = validate(bad, schema, schema);
        assert.ok(
            errs.some(e => /missing required "package"/.test(e)),
            errs.join('\n')
        );
    });

    test('rejects unknown top-level property', () => {
        const bad = { extensions: [], somethingElse: true };
        const errs = validate(bad, schema, schema);
        assert.ok(
            errs.some(e => /unexpected property "somethingElse"/.test(e)),
            errs.join('\n')
        );
    });

    test('rejects non-array extensions', () => {
        const errs = validate({ extensions: {} }, schema, schema);
        assert.ok(
            errs.some(e => /extensions: expected array/.test(e)),
            errs.join('\n')
        );
    });
});
