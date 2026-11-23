/**
 * 후보 뽑기 (순수 함수). rand 를 넘기면 테스트에서 결과를 고정할 수 있다.
 */
import { recentFactor } from './recent.js';
import { distanceFactor } from './weather.js';

/** 피셔-예이츠 섞기 (원본은 그대로) */
export function shuffle(list, rand = Math.random) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * 자동 채움 보정: 가중치를 둔 무작위.
 * - 돌림판에 이미 있는 세부 분류(예: 육류,고기)와 같으면 확률을 크게 낮춤 → 한 종류로 쏠리지 않게
 * - '전체'(types 가 비었을 때) 같은 큰 분류(한식 등)가 많으면 조금 낮춤
 * - 주점은 점심 후보로 덜 맞아 낮춤 (종류에서 주점을 직접 고르면 보정 안 함)
 * - 단골(favorites)은 3배
 * - 최근 먹은 것과 같은 종류면 낮춤 (recent: recentInfo 결과)
 * - 날씨가 나쁘면(near = 반경) 먼 곳일수록 낮춤 (logic/weather.distanceFactor, 최소 0.35)
 *
 * @param {{ types?: Set<string>, favorites?: Set<string>, recent?: object|null, near?: number|null }} ctx
 */
export function weightOf(place, chosen, { types = new Set(), favorites = new Set(), recent = null, near = null } = {}) {
    let w = 1;
    if (place.type === '술집' && !types.has('술집')) w *= 0.15;
    const sameCategory = chosen.filter((p) => p.category === place.category).length;
    w /= 1 + 5 * sameCategory;
    if (!types.size) {
        const sameType = chosen.filter((p) => p.type === place.type).length;
        w /= 1 + 0.6 * sameType;
    }
    if (favorites.has(place.id)) w *= 3;
    w *= recentFactor(place, recent, types.size > 0);
    if (near) w *= distanceFactor(place.distance ?? 0, near);
    return w;
}

/** pool 에서 n곳을 하나씩 가중치 무작위로 뽑음. chosen 은 이미 돌림판에 있는 곳 */
export function weightedPick(pool, n, chosen = [], ctx = {}, rand = Math.random) {
    const left = [...pool];
    const picked = [];
    while (picked.length < n && left.length) {
        const weights = left.map((p) => weightOf(p, [...chosen, ...picked], ctx));
        let r = rand() * weights.reduce((a, b) => a + b, 0);
        let i = 0;
        while (i < left.length - 1 && (r -= weights[i]) > 0) i++;
        picked.push(left.splice(i, 1)[0]);
    }
    return picked;
}
