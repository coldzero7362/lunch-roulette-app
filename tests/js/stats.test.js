import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthStats } from '../../resources/js/roulette/logic/stats.js';

const h = (name, type, day, price) => ({ id: name, name, type, category: type, day, price });

describe('monthStats', () => {
    const history = [
        h('국밥집', '한식', '2026-11-24', 9000),
        h('짬뽕집', '중식', '2026-11-21', 11000),
        h('국밥집', '한식', '2026-11-18', 9000),
        h('초밥집', '일식', '2026-11-17'),
        h('국밥집', '한식', '2026-10-31', 9000), // 지난달
    ];

    it('counts this month only, by type and place', () => {
        const s = monthStats(history, '2026-11');
        assert.equal(s.count, 4);
        assert.deepEqual(s.types, [{ type: '한식', n: 2 }, { type: '중식', n: 1 }, { type: '일식', n: 1 }]);
        assert.deepEqual(s.top, [{ name: '국밥집', n: 2 }]);
    });

    it('estimates spend from known prices and says how many were known', () => {
        const s = monthStats(history, '2026-11');
        assert.equal(s.spend, 29000);
        assert.equal(s.priced, 3);
        assert.equal(s.avg, 9700);
    });

    it('is empty for a month without lunches', () => {
        const s = monthStats(history, '2026-09');
        assert.equal(s.count, 0);
        assert.equal(s.avg, null);
    });
});
