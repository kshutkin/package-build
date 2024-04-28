import cd from 'child_process';
import { promisify, parseArgs } from 'util';
import assert from 'assert';
import test, { after } from 'node:test';
import fs from 'fs/promises';
import process from 'process';
import { filesToString, stringToFiles } from 'cli-test-helper';
import testCases from './tests.json' with { type: 'json' };

const exec = promisify(cd.exec);

const dir = './tests/tmp';

const args = parseArgs({ options: {
    update: {
        type: 'boolean',
        short: 'u',
        default: false,
    },
    capture: {
        type: 'string',
        short: 'c'
    },
    export: {
        type: 'string',
        short: 'e'
    }
}, args: process.argv.slice(2)}).values;

if ('capture' in args) {
    let testCase = testCases.find(testCase => testCase.name === args.capture);
    if (!testCase) {
        testCase = { name: args.capture };
        testCases.push(testCase);
    }
    testCase.input = await captureFiles();
    await writeTestCases();
    process.exit(0);
}

if ('export' in args) {
    const testCase = testCases.find(testCase => testCase.name === args.export);
    if (!testCase) {
        console.error('Test case not found: ' + JSON.stringify(args.export));
        process.exit(1);
    }
    await exportFiles(testCase);
    process.exit(0);
}

for (const testCase of testCases) {
    test(testCase.name, async () => {
        await cleanDir();
        await exportFiles(testCase);
        let result;
        try {
            result = await exec(`cd ${dir}; node ../../index.js ${testCase.args}`);
        } catch (e) {
            result = e;
        }

        const actualOutput = await captureFiles();

        if (args.update) {
            testCase.output = actualOutput;
            testCase.exitCode = result?.code;
            testCase.stdout = replaceTime(result?.stdout);
            testCase.stderr = result?.stderr;
        } else {
            assert.strictEqual(result?.code, testCase.exitCode);
            assert.strictEqual(actualOutput, testCase.output);
            assert.strictEqual(replaceTime(result?.stdout), testCase.stdout);
            assert.strictEqual(result?.stderr, testCase.stderr);
        }
    });
}

after(async () => {
    await cleanDir();
    if (args.update) {
        await writeTestCases();
    }
});

async function exportFiles(testCase) {
    await fs.mkdir(dir, { recursive: true });
    await stringToFiles(testCase.input, dir);
}

async function captureFiles() {
    return await filesToString(dir, ['node_modules']);
}

function cleanDir() {
    return fs.rm(dir, { recursive: true, force: true });
}

/**
 * @param {String} str 
 * @returns {String}
 */
function replaceTime(str) {
    if (!str) {
        return str;
    }
    return str.replaceAll(/in (\d+\.?\d+)m?s$/gm, 'in XXX');
}

function writeTestCases() {
    return fs.writeFile('./tests/tests.json', JSON.stringify(testCases, null, 4));
}