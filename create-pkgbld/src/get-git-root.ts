import childProcess from 'node:child_process';
import util from 'node:util';

export default async function getGitRoot() {
    const exec = util.promisify(childProcess.exec);
    const { stdout } = await exec('git rev-parse --show-toplevel');
    return stdout.trim();
}