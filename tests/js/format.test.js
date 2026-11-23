import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coordText, hhmm, logKey, matchRange, pad, radiusLabel, spinRotation, stepStates, typeLabel, walkMinutes } from '../../resources/js/roulette/logic/format.js';

describe('labels and numbers', () => {
    it('renames 술집 to 주점 only', () => {
        assert.equal(typeLabel('술집'), '주점');
        assert.equal(typeLabel('한식'), '한식');
    });

    it('formats radii', () => {
        assert.equal(radiusLabel(300), '300m');
        assert.equal(radiusLabel(1000), '1km');
    });

    it('pads LCD readings to fixed width', () => {
        assert.deepEqual(pad(500, 4), { seg: '0500' });
        assert.deepEqual(pad(238, 3), { seg: '238' });
        assert.deepEqual(pad(1234, 3), { seg: '1234' }); // 넘치면 자르지 않음
    });

    it('formats clock times and walking minutes', () => {
        assert.equal(hhmm(new Date(2026, 10, 19, 9, 5)), '09:05');
        assert.equal(walkMinutes(0), 1);
        assert.equal(walkMinutes(335), 5); // 67m/분
    });

    it('keys the log by local date', () => {
        assert.equal(logKey(new Date(2026, 0, 3)), 'lunch-roulette:log:2026-1-3');
    });

    it('prints coordinates to three decimals', () => {
        assert.equal(coordText({ lat: 37.56654, lng: 126.97796 }), '37.567N 126.978E');
        assert.equal(coordText(null), '--.---N ---.---E');
    });
});

describe('stepStates', () => {
    it('lights done steps and only the first pending one as now', () => {
        assert.deepEqual(stepStates({ loc: true, cond: true, cand: false, spin: false }), { loc: 'done', cond: 'done', cand: 'now', spin: 'off' });
        assert.deepEqual(stepStates({ loc: false, cond: false, cand: false, spin: false }), { loc: 'now', cond: 'off', cand: 'off', spin: 'off' });
        assert.deepEqual(stepStates({ loc: true, cond: true, cand: true, spin: true }), { loc: 'done', cond: 'done', cand: 'done', spin: 'done' });
    });
});

describe('spinRotation', () => {
    const atNeedle = (rotation, n) => {
        // 회전 후 12시 바늘 아래에 오는 칸 번호
        const slice = 360 / n;
        const under = (((-rotation) % 360) + 360) % 360;
        return Math.floor(under / slice);
    };

    it('lands the chosen slice under the needle', () => {
        for (const n of [2, 3, 8, 12]) {
            for (let index = 0; index < n; index++) {
                for (const jitter of [-0.5, 0, 0.5]) {
                    assert.equal(atNeedle(spinRotation(0, index, n, jitter), n), index, `n=${n} index=${index} jitter=${jitter}`);
                }
            }
        }
    });

    it('always turns forward at least six full turns from where it stopped', () => {
        const from = 1234.5;
        const to = spinRotation(from, 3, 8, 0.2);
        assert.ok(to - from >= 360 * 6 && to - from < 360 * 7);
        assert.equal(atNeedle(to, 8), 3);
    });
});

describe('matchRange', () => {
    it('finds the query ignoring spaces and case', () => {
        assert.deepEqual(matchRange('서현역 환승 공영주차장', '서현역환승'), [0, 6]);
        assert.deepEqual(matchRange('KFC 시청역점', 'kfc'), [0, 3]);
    });

    it('returns null when nothing matches or the query is blank', () => {
        assert.equal(matchRange('판교역', '서현'), null);
        assert.equal(matchRange('판교역', '   '), null);
    });
});

describe('prices', async () => {
    const { priceShort, wonLabel } = await import('../../resources/js/roulette/logic/format.js');
    it('formats won', () => {
        assert.equal(wonLabel(11000), '11,000원');
        assert.equal(priceShort(9000), '9천');
        assert.equal(priceShort(9500), '9.5천');
        assert.equal(priceShort(11000), '1.1만');
        assert.equal(priceShort(20000), '2만');
    });
});
