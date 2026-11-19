/**
 * 영업 상태: 후보 가게의 지금 영업 상태를 받아 두고, 배지·영업중 필터에 씀.
 */
import { HOURS_BATCH, KEYS } from './constants.js';
import { el, root } from './dom.js';
import { freshHours, hoursBadge, isShutStatus, unknownHours } from './logic/hours.js';
import { api } from './net.js';
import { setStatus } from './readout.js';
import { render } from './render.js';
import { state } from './state.js';

const inFlight = new Set();
let queueTimer;

export function hoursOf(place) {
    return freshHours(state.hours.get(place.id));
}

/** 지금 못 가는 곳 (영업 전·마감·휴무·브레이크) */
export function isShut(place) {
    return isShutStatus(hoursOf(place)?.status);
}

/** 영업중 토글이 켜졌을 때 추첨에서 빠지는 곳 */
export function blocked(place) {
    return state.openOnly && isShut(place);
}

/**
 * 가게들의 영업 상태를 서버에서 받아 둠 (이미 받은 지 10분 안 된 곳은 건너뜀).
 * 비공식 API 를 쓰므로 실패해도 막지 않는다: 그 가게는 정보 없음으로 두고 1분 뒤 다시 물어봄.
 */
export async function ensureHours(places) {
    const ids = [...new Set(places.filter((p) => !hoursOf(p) && !inFlight.has(p.id)).map((p) => p.id))];
    if (!ids.length) return;
    ids.forEach((id) => inFlight.add(id));

    const batches = [];
    for (let i = 0; i < ids.length; i += HOURS_BATCH) batches.push(ids.slice(i, i + HOURS_BATCH));

    await Promise.all(batches.map(async (batch) => {
        const url = new URL(root.dataset.hoursUrl);
        batch.forEach((id) => url.searchParams.append('ids[]', id));
        try {
            const res = await api(url);
            const body = res.ok ? await res.json() : {};
            const now = Date.now();
            batch.forEach((id) => {
                const h = body.hours?.[id];
                state.hours.set(id, h ? { ...unknownHours(now), ...h, at: now } : unknownHours(now, true));
            });
        } catch {
            batch.forEach((id) => state.hours.set(id, unknownHours(Date.now(), true)));
        } finally {
            batch.forEach((id) => inFlight.delete(id));
        }
    }));
}

/** 후보가 바뀌면 배지용으로 영업 상태를 뒤에서 받아 옴 */
export function queueHours() {
    clearTimeout(queueTimer);
    queueTimer = setTimeout(async () => {
        const missing = state.candidates.filter((p) => !hoursOf(p));
        if (!missing.length) return;
        await ensureHours(missing);
        if (!state.spinning && !state.checking) render();
    }, 250);
}

/** 후보 줄 배지: 영업중 / 곧마감 / 브레이크 / 영업전·영업마감 / 정보없음 */
export function hoursTag(place) {
    const badge = hoursBadge(hoursOf(place));
    const tag = document.createElement('span');
    tag.className = `rl-tag rl-tag--hours rl-tag--${badge.kind}`;
    tag.textContent = badge.text;
    tag.title = badge.title;
    return tag;
}

function setOpenOnly(on, save = true) {
    state.openOnly = on;
    el.openToggle.setAttribute('aria-pressed', String(on));
    if (save) {
        try { localStorage.setItem(KEYS.openOnly, on ? 'on' : 'off'); } catch { /* 저장 못 해도 동작 */ }
    }
    render();
    if (on && state.candidates.length) {
        const shut = state.candidates.filter(isShut).length;
        setStatus(shut ? `영업중 필터 ON — 후보 ${shut}곳 추첨 제외` : '영업중 필터 ON');
    } else if (!on) {
        setStatus('영업중 필터 OFF');
    }
}

export function initOpenOnly() {
    let saved = null;
    try { saved = localStorage.getItem(KEYS.openOnly); } catch { /* 비공개 모드 등 */ }
    setOpenOnly(saved === 'on', false);
    el.openToggle.addEventListener('click', () => setOpenOnly(!state.openOnly));
}
