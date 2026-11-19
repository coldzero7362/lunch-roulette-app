import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOURS_RETRY_MS, HOURS_TTL_MS } from '../../resources/js/roulette/constants.js';
import { freshHours, hoursBadge, hoursText, isClosingSoon, isShutStatus, unknownHours } from '../../resources/js/roulette/logic/hours.js';

const h = (status, label = '', info = '', today = '') => ({ status, label, info, today, at: 0 });

describe('freshHours', () => {
    it('keeps a lookup for 10 minutes', () => {
        const got = { ...h('open'), at: 1000 };
        assert.equal(freshHours(got, 1000 + HOURS_TTL_MS - 1), got);
        assert.equal(freshHours(got, 1000 + HOURS_TTL_MS), null);
        assert.equal(freshHours(undefined), null);
    });

    it('lets a failed lookup be retried after a minute', () => {
        const failed = unknownHours(5000, true);
        assert.equal(failed.status, 'unknown');
        assert.ok(freshHours(failed, 5000 + HOURS_RETRY_MS - 1));
        assert.equal(freshHours(failed, 5000 + HOURS_RETRY_MS), null);
    });
});

describe('isShutStatus', () => {
    it('treats closed and break as shut, unknown as not', () => {
        assert.equal(isShutStatus('closed'), true);
        assert.equal(isShutStatus('break'), true);
        assert.equal(isShutStatus('open'), false);
        assert.equal(isShutStatus('unknown'), false);
        assert.equal(isShutStatus(undefined), false);
    });
});

describe('isClosingSoon', () => {
    it('spots Kakao\'s "곧 영업 마감" on an open place', () => {
        assert.equal(isClosingSoon(h('open', '곧 영업 마감')), true);
        assert.equal(isClosingSoon(h('open', '영업 중')), false);
        assert.equal(isClosingSoon(h('closed', '곧 영업 마감')), false);
    });
});

describe('hoursText', () => {
    it('joins status, info and today\'s hours', () => {
        assert.equal(hoursText(h('open', '영업 중', '22:00 까지', '11:30 ~ 22:00')), '영업 중 · 22:00 까지 · 오늘 11:30 ~ 22:00');
        assert.equal(hoursText(h('break', '브레이크타임', '16:30 오픈')), '브레이크타임 · 16:30 오픈');
    });

    it('says nothing for unknown hours', () => {
        assert.equal(hoursText(h('unknown')), '');
        assert.equal(hoursText(null), '');
    });
});

describe('hoursBadge', () => {
    it('maps each status to a badge', () => {
        assert.deepEqual(
            [h('open', '영업 중'), h('open', '곧 영업 마감'), h('break', '브레이크타임'), h('closed', '영업 마감'), h('closed', ''), h('unknown')]
                .map((x) => [hoursBadge(x).kind, hoursBadge(x).text]),
            [['open', '영업중'], ['break', '곧마감'], ['break', '브레이크'], ['closed', '영업마감'], ['closed', '마감'], ['unknown', '정보없음']],
        );
    });

    it('shows a waiting badge before the lookup finishes', () => {
        assert.deepEqual(hoursBadge(null), { kind: 'wait', text: '···', title: '영업 상태 확인 중' });
    });
});
