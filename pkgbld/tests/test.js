import cd from 'child_process';
import { promisify, parseArgs } from 'util';
import assert from 'assert';
import test, { after, describe } from 'node:test';
import fs from 'fs/promises';
import process from 'process';
import { filesToString, stringToFiles } from 'cli-test-helper';
import tests from './tests.json' with { type: 'json' };

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
    },
    result: {
        type: 'string',
        short: 'r'
    }
}, args: process.argv.slice(2)}).values;

const allTestCases = Object.entries(tests).flatMap(entry => entry[1]);

if ('capture' in args) {
    const capture = Number(args.capture) || allTestCases.reduce((max, testCase) => Math.max(max, testCase.id), 0) + 1;
    let testCase = allTestCases.find(testCase => testCase.id === capture);
    if (!testCase) {
        testCase = { id: capture, name: '' };
        tests['capture'] = tests['capture'] || [];
        tests['capture'].push(testCase);
    }
    testCase.input = await captureFiles();
    await writeTestCases();
    process.exit(0);
}

if ('export' in args) {
    const exportN = Number(args.export);
    const testCase = allTestCases.find(testCase => testCase.id === exportN);
    if (!testCase) {
        console.error('Test case not found: ' + JSON.stringify(exportN));
        process.exit(1);
    }
    await exportFiles(testCase);
    process.exit(0);
}

if ('result' in args) {
    const exportN = Number(args.result);
    const testCase = allTestCases.find(testCase => testCase.id === exportN);
    if (!testCase) {
        console.error('Test case not found: ' + JSON.stringify(exportN));
        process.exit(1);
    }
    await exportFiles(testCase, true);
    process.exit(0);
}

for (const [suiteName, suiteTestCases] of Object.entries(tests)) {
    describe(suiteName, () => {
        for (const testCase of suiteTestCases) {
            test(testCase.name, async () => {
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
                    assert.ok(true);
                } else {
                    assert.strictEqual(result?.code, testCase.exitCode);
                    assert.strictEqual(actualOutput, testCase.output);
                    assert.strictEqual(replaceTime(result?.stdout), testCase.stdout);
                    assert.strictEqual(result?.stderr, testCase.stderr);
                }
            });
        }
    });
}
    
after(async () => {
    await cleanDir();
    if (args.update) {
        await writeTestCases();
    }
});

async function exportFiles(testCase, output = false) {
    await cleanDir();
    await fs.mkdir(dir, { recursive: true });
    await stringToFiles(output ? testCase.output : testCase.input, dir);
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
    return fs.writeFile('./tests/tests.json', JSON.stringify(tests, null, 4));
}