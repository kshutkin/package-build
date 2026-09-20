import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');

const schema = JSON.parse(readFileSync(path.join(pkgDir, 'extensions-schema.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(pkgDir, 'extensions.json'), 'utf8'));
const lockSchema = JSON.parse(readFileSync(path.join(pkgDir, 'lock-schema-v1.json'), 'utf8'));

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
    if ('const' in sch && value !== sch.const) {
        return [`${path.join('.') || '<root>'}: expected constant ${JSON.stringify(sch.const)}`];
    }
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
        if (sch.propertyNames) {
            for (const k of Object.keys(value)) errs.push(...validate(k, sch.propertyNames, root, [...path, k]));
        }
        for (const [k, propSch] of Object.entries(sch.properties ?? {})) {
            if (k in value) errs.push(...validate(value[k], propSch, root, [...path, k]));
        }
        if (sch.additionalProperties && typeof sch.additionalProperties === 'object') {
            for (const [k, v] of Object.entries(value)) {
                if (!(k in (sch.properties ?? {}))) errs.push(...validate(v, sch.additionalProperties, root, [...path, k]));
            }
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
        else if (sch.pattern && !new RegExp(sch.pattern).test(value)) errs.push(`${where}: pattern mismatch`);
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

describe('lock-schema-v1.json', () => {
    const schemaUri = 'https://unpkg.com/create-pkgbld/lock-schema-v1.json';

    test('accepts exact versions for canonical extension and plugin package names', () => {
        const lock = {
            $schema: schemaUri,
            packages: {
                'create-pkgbld-extension-biome': '0.1.1',
                '@author/pkgbld-plugin-example': '1.2.0-beta.1',
            },
        };
        assert.deepStrictEqual(validate(lock, lockSchema, lockSchema), []);
    });

    test('rejects aliases, package subpaths, and version ranges', () => {
        const lock = {
            $schema: schemaUri,
            packages: {
                biome: '^0.1.0',
                'pkgbld-plugin-example/extension': '1.0.0',
                'pkgbld-plugin-valid': '^1.0.0',
            },
        };
        const errs = validate(lock, lockSchema, lockSchema);
        assert.ok(
            errs.some(e => /packages\.biome: pattern mismatch/.test(e)),
            errs.join('\n')
        );
        assert.ok(
            errs.some(e => /packages\.pkgbld-plugin-example\/extension: pattern mismatch/.test(e)),
            errs.join('\n')
        );
        assert.ok(
            errs.some(e => /packages\.pkgbld-plugin-valid: pattern mismatch/.test(e)),
            errs.join('\n')
        );
    });
});
