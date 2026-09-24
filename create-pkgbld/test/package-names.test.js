import assert from 'node:assert';
import test, { describe } from 'node:test';

import { isPluginPackageName as isRuntimePluginPackageName } from '../../pkgbld/src/plugin-name.js';
import { getPackageKind, isExtensionPackageName, isLockPackageName, isPluginPackageName } from '../src/package-names.js';

describe('package naming', () => {
    test('matches PKG BLD runtime plugin discovery', () => {
        for (const packageName of [
            'pkgbld-plugin-demo',
            '@author/pkgbld-plugin-demo',
            '@author/create-pkgbld-extension-demo',
            '@author/other-pkgbld-plugin-demo',
            'unrelated',
        ]) {
            assert.strictEqual(isPluginPackageName(packageName), isRuntimePluginPackageName(packageName), packageName);
        }
    });

    test('classifies scoped and unscoped extensions separately', () => {
        assert.strictEqual(isExtensionPackageName('create-pkgbld-extension-demo'), true);
        assert.strictEqual(isExtensionPackageName('@author/create-pkgbld-extension-demo'), true);
        assert.strictEqual(getPackageKind('@author/create-pkgbld-extension-demo'), 'extension');
        assert.strictEqual(getPackageKind('@author/pkgbld-plugin-demo'), 'plugin');
        assert.strictEqual(getPackageKind('unrelated'), null);
        assert.strictEqual(isLockPackageName('@author/pkgbld-plugin-demo'), true);
        assert.strictEqual(isLockPackageName('pkgbld-plugin-'), false);
    });
});
