import assert from 'node:assert';
import cd from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test, { after, describe } from 'node:test';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

import { filesToString, stringToFiles } from 'cli-test-helper';

import './unit.js';

import tests from './tests.json' with { type: 'json' };

const exec = promisify(cd.exec);
const execFile = promisify(cd.execFile);

const dir = './tests/tmp';

const args = parseArgs({
    options: {
        update: {
            type: 'boolean',
            short: 'u',
            default: false,
        },
        capture: {
            type: 'string',
            short: 'c',
        },
        export: {
            type: 'string',
            short: 'e',
        },
        result: {
            type: 'string',
            short: 'r',
        },
    },
}).values;

const allTestCases = Object.entries(tests).flatMap(entry => entry[1]);

if ('capture' in args) {
    const capture = Number(args.capture) || allTestCases.reduce((max, testCase) => Math.max(max, testCase.id), 0) + 1;
    let testCase = allTestCases.find(testCase => testCase.id === capture);
    if (!testCase) {
        testCase = { id: capture, name: '' };
        tests.capture = tests.capture || [];
        tests.capture.push(testCase);
    }
    testCase.input = await captureFiles();
    await writeTestCases();
    process.exit(0);
}

if ('export' in args) {
    const exportN = Number(args.export);
    const testCase = allTestCases.find(testCase => testCase.id === exportN);
    if (!testCase) {
        console.error(`Test case not found: ${JSON.stringify(exportN)}`);
        process.exit(1);
    }
    await exportFiles(testCase);
    process.exit(0);
}

if ('result' in args) {
    const exportN = Number(args.result);
    const testCase = allTestCases.find(testCase => testCase.id === exportN);
    if (!testCase) {
        console.error(`Test case not found: ${JSON.stringify(exportN)}`);
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
                    result = await exec(`cd ${dir}; node ../../index.js${testCase.args != null ? ` ${testCase.args}` : ''}`);
                } catch (e) {
                    result = e;
                }

                if (result?.code == null && testCase.verifyEject) {
                    await executeEjectedConfig();
                }

                if (result?.code == null && testCase.verifyExports) {
                    await verifyPackageExports();
                }

                if (result?.code == null && testCase.verifyBins) {
                    await verifyPackageBins();
                }

                const actualOutput = await captureFiles();

                if (args.update) {
                    testCase.output = actualOutput;
                    testCase.exitCode = result?.code;
                    testCase.stdout = normalizeStdout(result?.stdout, testCase.unorderedBuildLogs);
                    testCase.stderr = result?.stderr;
                    assert.ok(true);
                } else {
                    assert.strictEqual(result?.code, testCase.exitCode);
                    assert.strictEqual(actualOutput, testCase.output);
                    assert.strictEqual(
                        normalizeStdout(result?.stdout, testCase.unorderedBuildLogs),
                        normalizeStdout(testCase.stdout, testCase.unorderedBuildLogs)
                    );
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

async function executeEjectedConfig() {
    const script = `
        import { rollup } from 'rollup';
        const { default: configs } = await import('./rollup.config.mjs');
        for (const config of configs) {
            const bundle = await rollup(config);
            for (const output of Array.isArray(config.output) ? config.output : [config.output]) {
                await bundle.write(output);
            }
            await bundle.close();
        }
    `;
    await execFile(process.execPath, ['--input-type=module', '--eval', script], { cwd: dir });
}

async function verifyPackageExports() {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    const targets = collectExportTargets(pkg.exports);

    for (const [condition, target] of targets) {
        const targetPath = path.resolve(dir, target);
        await fs.access(targetPath);
        if (condition === 'import') {
            await import(`${pathToFileURL(targetPath).href}?test=${Date.now()}`);
        } else if (condition === 'require') {
            await execFile(process.execPath, ['--eval', `require(${JSON.stringify(targetPath)})`]);
        }
    }
}

async function verifyPackageBins() {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});
    for (const bin of bins) {
        const binPath = path.resolve(dir, bin);
        const [content, stats] = await Promise.all([fs.readFile(binPath, 'utf8'), fs.stat(binPath)]);
        assert.match(content, /^#!\/usr\/bin\/env node\n/);
        assert.notEqual(stats.mode & 0o111, 0);
    }
}

/**
 * @param {unknown} exportsField
 * @param {string} [condition]
 * @returns {[string, string][]}
 */
function collectExportTargets(exportsField, condition = '') {
    if (typeof exportsField === 'string') {
        return exportsField.endsWith('package.json') ? [] : [[condition, exportsField]];
    }
    if (typeof exportsField !== 'object' || exportsField == null || Array.isArray(exportsField)) {
        return [];
    }
    return Object.entries(exportsField).flatMap(([key, value]) => collectExportTargets(value, key.startsWith('.') ? condition : key));
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

/**
 * Parallel Rollup configurations can finish in either order.
 * @param {string | undefined} str
 * @param {boolean | undefined} unorderedBuildLogs
 */
function normalizeStdout(str, unorderedBuildLogs) {
    const output = replaceTime(str);
    if (!output || !unorderedBuildLogs) {
        return output;
    }
    const messages = output.match(/^ℹ ✓ .*$/gm)?.sort() ?? [];
    let index = 0;
    return output.replaceAll(/^ℹ ✓ .*$/gm, () => messages[index++]);
}

function writeTestCases() {
    return fs.writeFile('./tests/tests.json', JSON.stringify(tests, null, 4));
}
