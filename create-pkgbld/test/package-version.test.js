import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePublishedVersion } from '../src/package-version.js';

describe('published package versions', () => {
    it('selects the newest stable version returned by npm', async () => {
        const version = await resolvePublishedVersion('example', '^2', async (command, args) => {
            assert.equal(command, 'npm');
            assert.deepEqual(args, ['view', 'example@^2', 'version', '--json']);
            return { code: 0, stdout: '["2.0.0", "2.2.0-beta.1", "2.1.3"]', stderr: '' };
        });
        assert.equal(version, '2.1.3');
    });

    it('reports registry lookup failures with npm diagnostics', async () => {
        await assert.rejects(
            resolvePublishedVersion('example', '^9', async () => ({ code: 1, stdout: '', stderr: 'version not found\n' })),
            /Cannot resolve a published version.*version not found/
        );
    });

    it('rejects responses without a stable exact version', async () => {
        await assert.rejects(
            resolvePublishedVersion('example', '^2', async () => ({ code: 0, stdout: '["2.0.0-beta.1"]', stderr: '' })),
            /No stable published version/
        );
    });
});
