/**
 * 표시용 문구·숫자 (순수 함수).
 */
import { KEYS, WALK_M_PER_MIN } from '../constants.js';

/** 카카오 분류 이름 → 화면 이름 */
export function typeLabel(type) {
    return type === '술집' ? '주점' : type;
}

/** 500 → '500m', 1000 → '1km' */
export function radiusLabel(radius) {
    return radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
}

/** LCD 7세그먼트 칸: 앞을 0으로 채운 고정 자릿수 { seg: '0500' } */
export function pad(n, width) {
    return { seg: String(n).padStart(width, '0') };
}

/** LCD 작은 단위 글자 { unit: 'M' } */
export function unit(text) {
    return { unit: text };
}

/** '09:05' */
export function hhmm(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 거리(m) → 도보 분 (최소 1분) */
export function walkMinutes(distance) {
    return Math.max(1, Math.round(distance / WALK_M_PER_MIN));
}

/** 오늘 기록 저장 키 (날짜별) */
export function logKey(d = new Date()) {
    return `${KEYS.log}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 위치 칸 아래 좌표 줄 */
export function coordText(center) {
    return center ? `${center.lat.toFixed(3)}N ${center.lng.toFixed(3)}E` : '--.---N ---.---E';
}

/**
 * 단계 표시등 상태: 끝난 단계 done, 그다음 할 단계 하나만 now, 나머지 off.
 * @param {Record<string, boolean>} done 단계 키 → 끝났는지 (순서대로)
 */
export function stepStates(done) {
    let nowSet = false;
    return Object.fromEntries(Object.entries(done).map(([key, ok]) => {
        if (ok) return [key, 'done'];
        if (!nowSet) { nowSet = true; return [key, 'now']; }
        return [key, 'off'];
    }));
}

/**
 * 돌림판 새 회전각: index 칸의 가운데(+흔들림)가 12시 바늘에 오도록, 지금 각도에서 시계 방향으로 6바퀴 이상.
 * jitter 는 -0.5~0.5 (칸 폭의 70% 안에서 흔들림)
 */
export function spinRotation(rotation, index, n, jitter = 0) {
    const slice = 360 / n;
    const target = -((index + 0.5) * slice) + jitter * slice * 0.7;
    const current = ((rotation % 360) + 360) % 360;
    const delta = (((target - current) % 360) + 360) % 360;
    return rotation + 360 * 6 + delta;
}

/**
 * 검색어가 걸린 글자 범위 [from, to) (공백·대소문자 무시). 없으면 null.
 * 글자 단위(코드 포인트) 위치라 한글·이모지도 안전
 */
export function matchRange(text, query) {
    const q = query.replace(/\s+/g, '').toLowerCase();
    if (!q) return null;
    const positions = []; // 공백을 뺀 위치 → 원문 위치
    let flat = '';
    [...text].forEach((ch, i) => { if (!/\s/.test(ch)) { positions.push(i); flat += ch.toLowerCase(); } });
    const at = flat.indexOf(q);
    if (at === -1) return null;
    return [positions[at], positions[at + q.length - 1] + 1];
}
