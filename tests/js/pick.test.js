import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shuffle, weightedPick, weightOf } from '../../resources/js/roulette/logic/pick.js';

const place = (id, type, category) => ({ id, type, category });

/** 정해진 순서로 값을 내는 가짜 난수 */
const sequence = (...values) => {
    let i = 0;
    return () => values[i++ % values.length];
};

describe('weightOf', () => {
    it('gives a fresh place full weight', () => {
        assert.equal(weightOf(place('a', '한식', '국밥'), []), 1);
    });

    it('strongly avoids a category already on the wheel', () => {
        const chosen = [place('x', '중식', '중국요리')];
        // 같은 세부 분류 1곳 → 1/(1+5), 같은 큰 분류 1곳 → 1/(1+0.6)
        assert.equal(weightOf(place('a', '중식', '중국요리'), chosen), 1 / 6 / 1.6);
    });

    it('ignores the big-type balance once a type filter is on', () => {
        const chosen = [place('x', '한식', '국밥')];
        assert.equal(weightOf(place('a', '한식', '냉면'), chosen, { types: new Set(['한식']) }), 1);
    });
});

describe('weightOf: favorites and recent meals', () => {
    it('triples favorites', () => {
        assert.equal(weightOf(place('f', '일식', '초밥'), [], { favorites: new Set(['f']) }), 3);
    });

    it('lowers what was eaten lately', () => {
        const recent = { ids: new Map(), categories: new Map([['국밥', 1]]), types: new Map([['한식', 1]]) };
        // 어제 국밥: 세부 분류 0.4 × 큰 분류 0.7
        assert.equal(weightOf(place('a', '한식', '국밥'), [], { recent }), 0.4 * 0.7);
        // 종류를 직접 골랐으면 큰 분류 보정은 없음
        assert.equal(weightOf(place('a', '한식', '국밥'), [], { recent, types: new Set(['한식']) }), 0.4);
        assert.equal(weightOf(place('b', '중식', '짬뽕'), [], { recent }), 1);
    });
});

describe('weightedPick', () => {
    const pool = [place('a', '한식', '국밥'), place('b', '중식', '짬뽕'), place('c', '일식', '초밥')];

    it('never picks more than asked or the same place twice', () => {
        const picked = weightedPick(pool, 2);
        assert.equal(picked.length, 2);
        assert.notEqual(picked[0].id, picked[1].id);
    });

    it('stops when the pool runs out', () => {
        assert.equal(weightedPick(pool, 10).length, 3);
    });

    it('follows the weights for a given random draw', () => {
        // 처음엔 세 곳 모두 무게 1 (합 3): 0.5×3 = 1.5 → 두 번째 칸(b)
        const [first] = weightedPick(pool, 1, [], {}, sequence(0.5));
        assert.equal(first.id, 'b');
    });

    it('leaves the input untouched', () => {
        const copy = [...pool];
        weightedPick(pool, 2);
        assert.deepEqual(pool, copy);
    });
});

describe('shuffle', () => {
    it('keeps every item exactly once', () => {
        const items = [1, 2, 3, 4, 5];
        assert.deepEqual(shuffle(items).sort(), items);
    });

    it('is deterministic with a fixed random source', () => {
        // 피셔-예이츠: 매번 0 이면 [b, c, d, a]
        assert.deepEqual(shuffle(['a', 'b', 'c', 'd'], () => 0), ['b', 'c', 'd', 'a']);
    });
});
