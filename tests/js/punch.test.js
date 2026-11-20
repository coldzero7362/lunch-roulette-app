import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { punchColumns, punchDigits } from '../../resources/js/roulette/logic/punch.js';

describe('punchDigits', () => {
    it('encodes place id, time and distance', () => {
        assert.equal(punchDigits({ id: '1076687577', distance: 249 }, new Date(2026, 10, 19, 12, 5)), '107668757712050249');
    });

    it('keeps only digits and clamps the distance', () => {
        assert.equal(punchDigits({ id: 'a1b2', distance: 123456 }, new Date(2026, 0, 1, 9, 0)), '1209009999');
        assert.equal(punchDigits({ id: '7', distance: -3 }, new Date(2026, 0, 1, 0, 0)), '700000000');
    });
});

describe('punchColumns', () => {
    it('puts one hole per column at the digit row', () => {
        assert.deepEqual(punchColumns('3071', 4), [3, 0, 7, 1]);
    });

    it('leaves trailing columns blank and cuts overflow', () => {
        assert.deepEqual(punchColumns('42', 4), [4, 2, null, null]);
        assert.deepEqual(punchColumns('123456', 3), [1, 2, 3]);
    });
});
