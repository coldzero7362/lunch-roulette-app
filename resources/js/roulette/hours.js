/**
 * 영업 상태: 가게별 영업 시간표를 받아 두고, 지금 상태(배지·영업중 필터·지도 핀)를 계산.
 *
 * 서버가 주는 7일치 시간표(week)를 브라우저에 하루 동안 저장해 두고, '지금 영업 중인지'는 시각마다 직접 계산한다.
 * → 같은 날 다시 열어도 다시 묻지 않고, 문을 열고 닫는 것도 조회 없이 반영 (1분마다 다시 계산).
 * 시간표가 없는 가게(정보 없음·형식이 다름)는 서버가 준 그 순간의 상태를 10분만 씀.
 */
import { HOURS_BATCH, KEYS, MAP_HOURS_LIMIT } from './constants.js';
import { el, root } from './dom.js';
import { freshHours, hoursBadge, isShutStatus, unknownHours } from './logic/hours.js';
import { dateKey, statusAt } from './logic/schedule.js';
import { drawMarkers } from './map.js';
import { api } from './net.js';
import { setStatus } from './readout.js';
import { render } from './render.js';
import { state } from './state.js';

const STORE_MAX = 1500; // 브라우저에 저장해 둘 가게 수 상한
const inFlight = new Set();
let queueTimer;
let saveTimer;

/** 가게의 지금 상태 { status, label, info, today } (모르면 null → 다시 물어봄) */
export function hoursOf(place) {
    const h = state.hours.get(place.id);
    if (!h) return null;
    // 오늘 받은 시간표가 있으면 지금 시각으로 계산
    if (h.week?.length && h.day === dateKey(new Date())) {
        const now = statusAt(h.week);
        if (now) return { ...h, ...now };
    }
    return freshHours(h);
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
 * 가게들의 영업 시간표를 서버에서 받아 둠 (오늘 받은 시간표가 있거나, 받은 지 10분 안 된 곳은 건너뜀).
 * force 면 있어도 새로 받음 (당첨 가게: 임시 휴무 같은 당일 변경 확인용).
 * 비공식 API 를 쓰므로 실패해도 막지 않는다: 그 가게는 정보 없음으로 두고 1분 뒤 다시 물어봄.
 */
export async function ensureHours(places, { force = false } = {}) {
    const ids = [...new Set(places.filter((p) => (force || !hoursOf(p)) && !inFlight.has(p.id)).map((p) => p.id))];
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
            const day = dateKey(new Date());
            batch.forEach((id) => {
                const h = body.hours?.[id];
                state.hours.set(id, h ? { ...unknownHours(now), week: [], ...h, at: now, day } : unknownHours(now, true));
            });
        } catch {
            batch.forEach((id) => state.hours.set(id, unknownHours(Date.now(), true)));
        } finally {
            batch.forEach((id) => inFlight.delete(id));
        }
    }));
    saveSoon();
}

/* ---------- 브라우저 저장 (하루) ---------- */

/** 오늘 받은 시간표만 저장 (상태만 있는 가게는 10분짜리라 저장 안 함) */
function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const today = dateKey(new Date());
        const keep = [...state.hours]
            .filter(([, h]) => h.week?.length && h.day === today)
            .sort(([, a], [, b]) => b.at - a.at)
            .slice(0, STORE_MAX);
        try { localStorage.setItem(KEYS.hours, JSON.stringify(Object.fromEntries(keep))); } catch { /* 저장 못 해도 동작 */ }
    }, 500);
}

/** 오늘 저장해 둔 시간표를 불러옴 (어제 것은 버림) */
function loadSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEYS.hours) ?? '{}');
        const today = dateKey(new Date());
        Object.entries(saved).forEach(([id, h]) => {
            if (h?.day === today && Array.isArray(h.week) && h.week.length) state.hours.set(id, h);
        });
    } catch { /* 깨졌으면 새로 받음 */ }
}

/* ---------- 화면 반영 ---------- */

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

/**
 * 영업중 필터가 켜져 있으면 지도에 뜬 가게들(가까운 MAP_HOURS_LIMIT 곳)의 영업시간을 받아 두고 핀을 다시 그림.
 * 묶음마다 받는 대로 바로 반영 (다 받을 때까지 기다리지 않음). 조회 중 반경이 바뀌면 멈춤
 */
let mapHoursRun = 0;
export async function loadMapHours() {
    if (!state.openOnly || !state.pool.length) return;
    const run = ++mapHoursRun;
    const pool = state.pool;
    const targets = pool.slice(0, MAP_HOURS_LIMIT).filter((p) => !hoursOf(p));
    for (let i = 0; i < targets.length; i += HOURS_BATCH) {
        await ensureHours(targets.slice(i, i + HOURS_BATCH));
        if (run !== mapHoursRun || pool !== state.pool || !state.openOnly) return;
        drawMarkers();
    }
}

/** 1분마다: 시간이 흘러 문을 열고 닫은 것을 배지·돌림판·지도에 반영 (조회 없이 다시 계산만) */
function startClock() {
    let minute = new Date().getMinutes();
    setInterval(() => {
        const now = new Date();
        if (now.getMinutes() === minute) return;
        minute = now.getMinutes();
        if (state.spinning || state.checking || !state.hours.size) return;
        render();
        if (state.openOnly) drawMarkers();
    }, 5000);
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
    drawMarkers();
    loadMapHours();
    if (on && state.candidates.length) {
        const shut = state.candidates.filter(isShut).length;
        setStatus(shut ? `영업중 필터 ON — 후보 ${shut}곳 추첨 제외` : '영업중 필터 ON');
    } else if (!on) {
        setStatus('영업중 필터 OFF');
    }
}

export function initOpenOnly() {
    loadSaved();
    startClock();
    let saved = null;
    try { saved = localStorage.getItem(KEYS.openOnly); } catch { /* 비공개 모드 등 */ }
    setOpenOnly(saved === 'on', false);
    el.openToggle.addEventListener('click', () => setOpenOnly(!state.openOnly));
}
