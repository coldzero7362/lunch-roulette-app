/**
 * 최근 먹은 곳·종류 (순수 함수). history = [{ id, name, type, category, day: 'YYYY-MM-DD' }] (최신이 앞)
 */

/** 이 날수 안에 먹은 가게는 자동 채움에서 빼고, 목록에 'n일 전' 표시 */
export const RECENT_DAYS = 7;

/** 기록 날짜 → '오늘' / '어제' / 'n일 전' (일주일 넘으면 'M/D') */
export function daysGapLabel(day, today) {
    const n = daysBetween(day, today);
    if (n < RECENT_DAYS) return daysAgoLabel(n);
    const [, m, d] = day.split('-').map(Number);
    return `${m}/${d}`;
}

/** 'YYYY-MM-DD' 두 날짜 사이 날수 (to - from) */
export function daysBetween(from, to) {
    const [a, b] = [from, to].map((k) => {
        const [y, m, d] = k.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    });
    return Math.round((b - a) / 86400000);
}

/**
 * 최근 RECENT_DAYS 일 안의 기록 → 가게·세부 분류·큰 분류별로 '며칠 전'(가장 최근) 지도
 * @returns {{ ids: Map<string, number>, categories: Map<string, number>, types: Map<string, number> }}
 */
export function recentInfo(history, today) {
    const info = { ids: new Map(), categories: new Map(), types: new Map() };
    for (const h of history ?? []) {
        const days = daysBetween(h.day, today);
        if (days < 0 || days >= RECENT_DAYS) continue;
        const keep = (map, key) => { if (key && !(map.get(key) <= days)) map.set(key, days); };
        keep(info.ids, String(h.id));
        keep(info.categories, h.category);
        keep(info.types, h.type);
    }
    return info;
}

/**
 * 최근 먹은 것과 같은 종류면 확률을 낮추는 배수.
 * 세부 분류(예: 국밥)는 오늘·어제·그제 순으로 0.25·0.4·0.6, 큰 분류(예: 한식)는 오늘·어제 0.7 (종류를 직접 고른 경우는 큰 분류 보정 없음)
 */
export function recentFactor(place, info, typeFilterOn = false) {
    if (!info) return 1;
    let f = 1;
    const cat = info.categories.get(place.category);
    if (cat !== undefined && cat <= 2) f *= [0.25, 0.4, 0.6][cat];
    const type = info.types.get(place.type);
    if (!typeFilterOn && type !== undefined && type <= 1) f *= 0.7;
    return f;
}

/** 목록 표시: 0 → '오늘', 3 → '3일 전' */
export function daysAgoLabel(days) {
    return days === 0 ? '오늘' : `${days}일 전`;
}
