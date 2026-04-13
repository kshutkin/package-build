import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import { filesToString, stringToFiles } from './index.js';

let dir;

beforeEach(() => {
    dir = path.join(os.tmpdir(), Math.random().toString(36));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true });
});

test('stringToFiles + filesToString', async () => {
    const referenceString = `tmp1
  1.js
|sdsdf
|dfdfg
  tmp2`;

    await stringToFiles(referenceString, dir);

    const readBackString = await filesToString(dir);

    assert.strictEqual(referenceString, readBackString, 'Strings are not equal');
});

test('stringToFiles + filesToString - nested empty dirs', async () => {
    const referenceString = `tmp1
  1.js
|sdsdf
|dfdfg
  tmp2
  tmp3
    tmp4`;

    await stringToFiles(referenceString, dir);

    const readBackString = await filesToString(dir);

    assert.strictEqual(referenceString, readBackString, 'Strings are not equal');
});

test('stringToFiles + filesToString - skips empty lines', async () => {
    const referenceString = `tmp1
  1.js
|sdsdf

|dfdfg
  tmp2`;

    await stringToFiles(referenceString, dir);

    const readBackString = await filesToString(dir);

    const referenceStringWithoutEmpty = referenceString.split('\n').filter(Boolean).join('\n');

    assert.strictEqual(referenceStringWithoutEmpty, readBackString, 'Strings are not equal');
});
