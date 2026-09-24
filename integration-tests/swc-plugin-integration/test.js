import assert from 'node:assert';
import test from 'node:test';

test('esm output is valid', async () => {
    const mod = await import('./dist/index.mjs');
    assert.strictEqual(mod.greeting, 'hello');
    assert.strictEqual(mod.add(2, 3), 5);
    assert.deepStrictEqual(mod.createConfig('test', 42), { name: 'test', value: 42 });
});

test('cjs output is valid', async () => {
    const mod = await import('./dist/index.cjs');
    assert.strictEqual(mod.greeting, 'hello');
    assert.strictEqual(mod.add(2, 3), 5);
    assert.deepStrictEqual(mod.createConfig('test', 42), { name: 'test', value: 42 });
});

test('types are stripped (no type annotations in output)', async () => {
    const fs = await import('node:fs/promises');
    const esmContent = await fs.readFile('./dist/index.mjs', 'utf-8');
    // Verify TypeScript types are stripped
    assert.ok(!esmContent.includes(': string'), 'Type annotation ": string" should be stripped');
    assert.ok(!esmContent.includes(': number'), 'Type annotation ": number" should be stripped');
    assert.ok(!esmContent.includes('interface'), 'Interface declaration should be stripped');
    // Verify actual code is preserved
    assert.ok(esmContent.includes('hello'), 'String literal should be preserved');
    assert.ok(esmContent.includes('return'), 'Function body should be preserved');
});
