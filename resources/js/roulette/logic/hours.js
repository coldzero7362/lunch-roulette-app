/**
 * 영업 상태 판정·문구 (순수 함수).
 * h = 서버 /restaurants/hours 의 한 가게 { status, label, info, today } + 받은 시각 at
 */
import { HOURS_RETRY_MS, HOURS_TTL_MS } from '../constants.js';

/** 받은 지 10분 안 된 것만 유효 */
export function freshHours(h, now = Date.now()) {
    return h && now - h.at < HOURS_TTL_MS ? h : null;
}

/** 지금 못 가는 상태: 영업 전·마감·휴무·브레이크타임. 정보 없음은 거르지 않음 (가 보면 열려 있을 수도) */
export function isShutStatus(status) {
    return status === 'closed' || status === 'break';
}

/** 곧 마감: 아직 영업 중이지만 따로 표시 */
export function isClosingSoon(h) {
    return h?.status === 'open' && h.label.includes('곧');
}

/** 정보 없음. retry 면 1분 뒤 다시 물어볼 수 있게 받은 시각을 앞당겨 둠 */
export function unknownHours(now = Date.now(), retry = false) {
    return { status: 'unknown', label: '', info: '', today: '', at: retry ? now - HOURS_TTL_MS + HOURS_RETRY_MS : now };
}

/** "영업 중 · 22:00 까지 · 오늘 11:30 ~ 22:00" */
export function hoursText(h) {
    if (!h || h.status === 'unknown') return '';
    return [[h.label, h.info].filter(Boolean).join(' · '), h.today ? `오늘 ${h.today}` : ''].filter(Boolean).join(' · ');
}

/**
 * 후보 줄 배지: { kind: CSS 변형, text, title }.
 * 영업중 / 곧마감(앰버) / 브레이크 / 영업전·영업마감 / 정보없음 / 확인 중
 */
export function hoursBadge(h) {
    if (!h) return { kind: 'wait', text: '···', title: '영업 상태 확인 중' };
    const title = hoursText(h) || '영업시간 정보 없음';
    if (h.status === 'open') return isClosingSoon(h) ? { kind: 'break', text: '곧마감', title } : { kind: 'open', text: '영업중', title };
    if (h.status === 'break') return { kind: 'break', text: '브레이크', title };
    if (h.status === 'closed') return { kind: 'closed', text: h.label.replace(/\s+/g, '') || '마감', title };
    return { kind: 'unknown', text: '정보없음', title };
}
