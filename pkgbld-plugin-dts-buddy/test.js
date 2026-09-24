import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('published declarations do not reference create-pkgbld internals', async () => {
    const declarations = await fs.readFile(new URL('./types/index.d.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(declarations, /create-pkgbld\//);
});
