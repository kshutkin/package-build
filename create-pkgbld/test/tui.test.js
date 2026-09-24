import assert from 'node:assert';
import test, { describe } from 'node:test';

import { getPromptOption } from '../src/tui.js';

describe('getPromptOption', () => {
    test('builds a text prompt from its declared default', () => {
        const cfg = getPromptOption({ title: 'Name', field: 'name', initialValue: 'foo' }, {});
        assert.strictEqual(cfg.type, 'text');
        assert.strictEqual(cfg.name, 'name');
        assert.strictEqual(cfg.initial, 'foo');
    });

    test('prefers a collected answer over the declared default', () => {
        const cfg = getPromptOption({ title: 'Name', field: 'name', initialValue: 'foo' }, { name: 'bar' });
        assert.strictEqual(cfg.initial, 'bar');
    });

    test('multiselect builds choices with selected flag', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'multiselect', list: ['a', 'b'] }, { f: ['b'] });
        const choices = /** @type {any[]} */ (cfg.choices);
        assert.strictEqual(choices[1].selected, true);
        assert.strictEqual(choices[0].selected, false);
    });

    test('multiselect uses its declared defaults before answers are collected', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'multiselect', list: ['a', 'b'], initialValue: ['a'] }, {});
        const choices = /** @type {any[]} */ (cfg.choices);
        assert.strictEqual(choices[0].selected, true);
        assert.strictEqual(choices[1].selected, false);
    });

    test('select resolves initial index from value', () => {
        const cfg = getPromptOption({ title: 'F', field: 'f', type: 'select', list: ['a', 'b', 'c'] }, { f: 'c' });
        assert.strictEqual(cfg.initial, 2);
    });
});
