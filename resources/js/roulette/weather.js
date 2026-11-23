/**
 * 날씨: 서버 /weather (0.1° 격자 · 1시간 캐시) → 브라우저에도 1시간 보관.
 * 페이지를 열 때가 아니라 처음 뽑을 때만 받음 (구경만 하면 호출 0). 실패하면 보정 없이 뽑음.
 */
import { KEYS } from './constants.js';
import { referenceTime } from './hours.js';
import { badWeather, WEATHER_TEXT } from './logic/weather.js';
import { api } from './net.js';
import { weatherOn } from './prefs.js';
import { setLamp } from './readout.js';
import { state } from './state.js';

const KEEP_MS = 60 * 60 * 1000;
const WAIT_MS = 2500; // 날씨가 늦으면 기다리지 않고 그냥 뽑음

/** 서버와 같은 0.1° 칸 */
const cellOf = (c) => `${c.lat.toFixed(1)},${c.lng.toFixed(1)}`;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD

let current = null; // { cell, date, hours, at }
let loading = null;

function fromStorage(cell) {
    try {
        const saved = JSON.parse(localStorage.getItem(KEYS.weather) ?? 'null');
        if (saved?.cell === cell && saved.date === today() && Date.now() - saved.at < KEEP_MS) return saved;
    } catch { /* 비공개 모드 등 */ }
    return null;
}

/** 지금 위치의 오늘 날씨를 준비 (이미 있으면 바로 끝) */
export async function ensureWeather() {
    if (!weatherOn() || !state.center) return;
    const cell = cellOf(state.center);
    if (current?.cell === cell && current.date === today() && Date.now() - current.at < KEEP_MS) return;
    current = fromStorage(cell);
    if (current) { updateLamp(); return; }

    loading ??= (async () => {
        try {
            const res = await api(`/weather?lat=${state.center.lat}&lng=${state.center.lng}`);
            const body = res.ok ? await res.json() : null;
            if (!body?.weather) return;
            current = { ...body.weather, at: Date.now() };
            try { localStorage.setItem(KEYS.weather, JSON.stringify(current)); } catch { /* 저장 못 해도 동작 */ }
        } catch { /* 보정 없이 뽑음 */ } finally {
            loading = null;
            updateLamp();
        }
    })();
    await Promise.race([loading, new Promise((ok) => setTimeout(ok, WAIT_MS))]);
}

/** 기준 시각(지금 / 12:00 / 12:30)의 나쁜 날씨 종류, 없거나 꺼져 있으면 null */
export function weatherNow() {
    if (!weatherOn() || !current || !state.center || current.cell !== cellOf(state.center)) return null;
    const hour = String(referenceTime().getHours()).padStart(2, '0');
    return badWeather(current.hours[hour]);
}

/** 상태 줄에 붙일 말 ('비 예보 — 가까운 곳 위주'), 보정이 없으면 '' */
export function weatherNote() {
    const kind = weatherNow();
    return kind ? `${WEATHER_TEXT[kind]} — 가까운 곳 위주` : '';
}

/** WX 표시등: 나쁜 날씨 보정 중이면 켬 */
export function updateLamp() {
    setLamp('wx', weatherNow() ? 'on' : 'off');
}
