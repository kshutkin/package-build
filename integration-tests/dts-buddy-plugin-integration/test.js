import assert from 'node:assert/strict';
import test from 'node:test';

import { filesToString } from 'cli-test-helper';

test('check result', async () => {
    const readBackString = await filesToString('./dist');

    assert.equal(
        readBackString,
        'index.d.ts\n|declare module \'test1\' {\n|\texport const test = 1;\n|\n|\texport {};\n|}\n|\n|//# sourceMappingURL=index.d.ts.map\nindex.d.ts.map\n|{\n|\t"version": 3,\n|\t"file": "index.d.ts",\n|\t"names": [\n|\t\t"test"\n|\t],\n|\t"sources": [\n|\t\t"../src/index.ts"\n|\t],\n|\t"sourcesContent": [\n|\t\tnull\n|\t],\n|\t"mappings": ";cAAaA,IAAIA",\n|\t"ignoreList": []\n|}\nindex.mjs\n|const test = 1;\n|\n|export { test };\n|'
    );
});
