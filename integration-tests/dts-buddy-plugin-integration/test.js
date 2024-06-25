import test, {  } from 'node:test';
import { filesToString } from 'cli-test-helper';
import assert from 'node:assert';

test('check result', async () => {
    const readBackString = await filesToString('./dist');

    assert(readBackString, 'index.d.ts\n|declare module \'test1\' {\n|\tconst test = 1;\n|\n|\texport { test };\n|}\n|\n|//# sourceMappingURL=index.d.ts.map\nindex.d.ts.map\n|{\n|\t\"version\": 3,\n|\t\"file\": \"index.d.ts\",\n|\t\"names\": [\n|\t\t\"test\"\n|\t],\n|\t\"sources\": [\n|\t\t\"index.d.ts\"\n|\t],\n|\t\"sourcesContent\": [\n|\t\tnull\n|\t],\n|\t\"mappings\": \";OAAqBA,IAAIA\",\n|\t\"ignoreList\": []\n|}\nindex.mjs\n|const test = 1;\n|\n|export { test };\n|');
});