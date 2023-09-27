import { readFile, writeFile } from "fs/promises";

const cjsFile = await readFile("./dist/index.cjs", "utf8");

const updatedCjsFile = cjsFile.replace(/^require\('typia'\);$/gm, "");

await writeFile("./dist/index.cjs", updatedCjsFile);

const mjsFile = await readFile("./dist/index.mjs", "utf8");

const updatedMjsFile = mjsFile.replace(/^import 'typia';$/gm, "");

await writeFile("./dist/index.mjs", updatedMjsFile);