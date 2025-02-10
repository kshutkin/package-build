import { filesToString, stringToFiles } from 'cli-test-helper';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert';
import test, { afterEach, beforeEach, describe } from 'node:test';
import cd from 'node:child_process';
import util from 'node:util';

const exec = util.promisify(cd.exec);

let dir;

beforeEach(async () => {
    dir = path.join(os.tmpdir(), Math.random().toString(36));
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        console.error(e);
    }
});

afterEach(async () => {
    try {
        await fs.rm(dir, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(e);
        }
    }
});

const helpText = `Usage: <command> [options]
Commands:
    rm <path> - Remove a file or directory.
    cp <src> <dest> - Copy a file or directory.
    mv <from> <to> - Move a file or directory.
    ln <existingPath> <newPath> - Create a hard link.

`;

describe('top level script', () => {
    
    test('wrong command', async () => {
        let result;
        try {
            await exec('node index.js wrong');
        } catch (e) {
            result = e;
        }

        assert.strictEqual('Unknown command: wrong\n', result.stderr, 'Wrong error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });

    test('no command', async () => {
        const result = await exec('node index.js');

        assert.strictEqual(helpText, result.stdout, 'Wrong error message');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });
});

test('help command', async () => {
    const result = await exec('node index.js help');

    assert.strictEqual(helpText, result.stdout, 'Wrong error message');
    assert.strictEqual(undefined, result.code, 'Wrong exit code');
});

describe('rm', () => {

    test('happy path (directory)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';

        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js rm ${dir}/tmp1`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, '', 'Directory is not empty');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('happy path (file)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';

        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js rm ${dir}/tmp1/1.js`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp1\n  tmp2', 'Directory is not empty');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('no dir', async () => {
        const referenceString = 'tmp2\n  tmp2';

        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js rm ${dir}/tmp1`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, referenceString, 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('no arg', async () => {
        let result;
        try {
            await exec('node index.js rm');
        } catch (e) {
            result = e;
        }

        assert.strictEqual('Usage: rm <path>\n', result.stderr, 'Wrong error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });

    test('no permission', async () => {
        let result;
        try {
            await exec(`node index.js rm ${os.tmpdir()}`);
        } catch (e) {
            result = e;
        }

        assert.strictEqual(true, result.stderr.includes('Error'), 'Has no error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });

});

describe('cp', () => {

    test('happy path (directory)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';
            
        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js cp ${dir}/tmp1 ${dir}/tmp3`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp1\n  1.js\n|sdsdf\n  tmp2\ntmp3\n  1.js\n|sdsdf\n  tmp2', 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('happy path (file)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';
            
        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js cp ${dir}/tmp1/1.js ${dir}/tmp1/2.js`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp1\n  1.js\n|sdsdf\n  2.js\n|sdsdf\n  tmp2', 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('no args', async () => {
        let result;
        try {
            await exec('node index.js cp');
        } catch (e) {
            result = e;
        }

        assert.strictEqual('Usage: cp <src> <dest>\n', result.stderr, 'Wrong error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });
});

describe('ln', () => {

    test('happy path (directory)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';
            
        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js ln ${dir}/tmp1 ${dir}/tmp2`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp1\n  1.js\n|sdsdf\n  tmp2\ntmp2\n  1.js\n|sdsdf\n  tmp2', 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('happy path (file)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';
            
        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js ln ${dir}/tmp1/1.js ${dir}/tmp1/2.js`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp1\n  1.js\n|sdsdf\n  2.js\n|sdsdf\n  tmp2', 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('no args', async () => {
        let result;
        try {
            await exec('node index.js ln');
        } catch (e) {
            result = e;
        }

        assert.strictEqual('Usage: ln <existingPath> <newPath>\n', result.stderr, 'Wrong error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });
});

describe('mv', () => {

    test('happy path (directory)', async () => {
        const referenceString = 'tmp1\n  1.js\n|sdsdf\n  tmp2';
            
        await stringToFiles(referenceString, dir);

        const result = await exec(`node index.js mv ${dir}/tmp1 ${dir}/tmp2`);

        const readBackString = await filesToString(dir);

        assert.strictEqual(readBackString, 'tmp2\n  1.js\n|sdsdf\n  tmp2', 'Directory is not the same');
        assert.strictEqual(undefined, result.code, 'Wrong exit code');
    });

    test('no args', async () => {
        let result;
        try {
            await exec('node index.js mv');
        } catch (e) {
            result = e;
        }

        assert.strictEqual('Usage: mv <from> <to>\n', result.stderr, 'Wrong error message');
        assert.strictEqual(1, result.code, 'Wrong exit code');
    });
});