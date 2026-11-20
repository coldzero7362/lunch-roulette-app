import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dateKey, dayText, statusAt } from '../../resources/js/roulette/logic/schedule.js';

const day = (date, open, close, breaks = []) => ({ date, off: false, open, close, breaks });
const off = (date) => ({ date, off: true, open: null, close: null, breaks: [] });
const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min);

const week = [
    day('2026-11-19', '11:00', '20:30', [['14:30', '16:30']]),
    day('2026-11-20', '11:00', '20:30'),
    off('2026-11-21'),
    day('2026-11-22', '12:00', '18:00'),
];

describe('statusAt', () => {
    it('walks through a normal day', () => {
        const pick = (h, m) => {
            const s = statusAt(week, at(2026, 11, 19, h, m));
            return [s.status, s.label, s.info];
        };
        assert.deepEqual(pick(10, 0), ['closed', '영업 전', '11:00 오픈']);
        assert.deepEqual(pick(11, 0), ['open', '영업 중', '20:30 까지']);
        assert.deepEqual(pick(15, 0), ['break', '브레이크타임', '16:30 오픈']);
        assert.deepEqual(pick(16, 30), ['open', '영업 중', '20:30 까지']);
        assert.deepEqual(pick(20, 0), ['open', '곧 영업 마감', '20:30 까지']);
        assert.deepEqual(pick(20, 30), ['closed', '영업 마감', '내일 11:00 오픈']);
    });

    it('skips a day off when pointing to the next opening', () => {
        assert.deepEqual(statusAt(week, at(2026, 11, 20, 21, 0)).info, '11/22 12:00 오픈');
        const s = statusAt(week, at(2026, 11, 21, 13, 0));
        assert.deepEqual([s.status, s.label, s.today, s.info], ['closed', '휴무일', '휴무일', '내일 12:00 오픈']);
    });

    it('handles hours that run past midnight', () => {
        const night = [day('2026-11-19', '19:00', '03:00'), day('2026-11-20', '19:00', '03:00')];
        assert.equal(statusAt(night, at(2026, 11, 19, 23, 0)).status, 'open');
        // 다음 날 새벽: 어제 영업이 이어짐
        const late = statusAt(night, at(2026, 11, 20, 2, 45));
        assert.deepEqual([late.status, late.label, late.info], ['open', '곧 영업 마감', '03:00 까지']);
        assert.equal(statusAt(night, at(2026, 11, 20, 4, 0)).label, '영업 전');
    });

    it('treats 00:00 ~ 24:00 as open all day', () => {
        const allDay = [day('2026-11-19', '00:00', '24:00')];
        assert.equal(statusAt(allDay, at(2026, 11, 19, 3, 0)).status, 'open');
        assert.equal(statusAt(allDay, at(2026, 11, 19, 23, 0)).label, '영업 중');
    });

    it('returns null when today is not in the schedule', () => {
        assert.equal(statusAt(week, at(2026, 11, 25, 12, 0)), null);
        assert.equal(statusAt([], at(2026, 11, 19, 12, 0)), null);
        assert.equal(statusAt(undefined), null);
    });
});

describe('dayText / dateKey', () => {
    it('formats like the server', () => {
        assert.equal(dayText(week[0]), '11:00 ~ 20:30 (브레이크 14:30 ~ 16:30)');
        assert.equal(dayText(off('2026-11-21')), '휴무일');
        assert.equal(dateKey(at(2026, 1, 5, 9, 0)), '2026-01-05');
    });
});
