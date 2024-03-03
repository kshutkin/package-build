import { readFile, writeFile } from 'fs/promises';

const mjsFile = await readFile('./dist/index.mjs', 'utf8');

const updatedMjsFile = mjsFile.replace(/^import 'typia';$/gm, '');

await writeFile('./dist/index.mjs', updatedMjsFile);