import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daysAgoLabel, daysBetween, recentFactor, recentInfo } from '../../resources/js/roulette/logic/recent.js';

const history = [
    { id: '1', name: '국밥집', type: '한식', category: '국밥', day: '2026-11-23' },
    { id: '2', name: '짬뽕집', type: '중식', category: '짬뽕', day: '2026-11-21' },
    { id: '1', name: '국밥집', type: '한식', category: '국밥', day: '2026-11-20' },
    { id: '3', name: '옛날집', type: '양식', category: '피자', day: '2026-11-10' },
];

describe('recentInfo', () => {
    it('keeps the latest day per place and category within a week', () => {
        const info = recentInfo(history, '2026-11-23');
        assert.equal(info.ids.get('1'), 0);
        assert.equal(info.ids.get('2'), 2);
        assert.equal(info.ids.has('3'), false); // 13일 전은 뺌
        assert.equal(info.categories.get('국밥'), 0);
        assert.equal(info.types.get('중식'), 2);
    });

    it('counts days across months', () => {
        assert.equal(daysBetween('2026-11-30', '2026-12-02'), 2);
    });
});

describe('recentFactor', () => {
    const info = recentInfo(history, '2026-11-23');

    it('fades out over three days for the same dish', () => {
        assert.equal(recentFactor({ type: '한식', category: '국밥' }, info), 0.25 * 0.7);
        assert.equal(recentFactor({ type: '중식', category: '짬뽕' }, info), 0.6);
        assert.equal(recentFactor({ type: '일식', category: '초밥' }, info), 1);
        assert.equal(recentFactor({ type: '일식', category: '초밥' }, null), 1);
    });
});

describe('daysAgoLabel', () => {
    it('reads naturally', () => {
        assert.equal(daysAgoLabel(0), '오늘');
        assert.equal(daysAgoLabel(3), '3일 전');
    });
});
