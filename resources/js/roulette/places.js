/**
 * 반경 안 식당 조회와 후보(돌림판 칸) 관리: 자동 채움·섞기·비우기·제외·후보 수·직접 추가.
 */
import { ACCURACY_WARN_M, HOURS_BATCH, KEYS, SLOTS_DEFAULT, SLOTS_MAX, SLOTS_MIN } from './constants.js';
import { el, root } from './dom.js';
import { ensureHours, isShut } from './hours.js';
import { shuffle, weightedPick } from './logic/pick.js';
import { drawMarkers } from './map.js';
import { setSearchStatus } from './menu-search.js';
import { api } from './net.js';
import { setStatus } from './readout.js';
import { render, setBusy } from './render.js';
import { state } from './state.js';
import { clearResult } from './ticket.js';

export async function fetchPlaces() {
    if (!state.center) return;

    const requestId = ++state.requestId;
    setStatus('반경 내 식당 조회 중');
    setBusy(true);

    const url = new URL(root.dataset.restaurantsUrl);
    url.search = areaParams();
    state.types.forEach((t) => url.searchParams.append('types[]', t));

    try {
        const res = await api(url);
        const body = await res.json().catch(() => ({}));
        if (requestId !== state.requestId) return; // 더 최신 요청이 있음

        if (!res.ok) {
            const msg = res.status === 422 ? '국내 좌표만 지원'
                : res.status === 429 ? '요청 초과 — 60초 후 재시도'
                : body.message ?? '식당 조회 실패 — 재시도';
            throw new Error(msg);
        }

        state.pool = body.places ?? [];
        state.poolLoaded = true;
        clearResult();
        dropAutoCandidates();
        drawMarkers();

        let message = !state.pool.length ? '반경 내 결과 0건 — 반경 확대 또는 종류 변경'
            : state.candidates.length ? 'READY' : 'READY — 자동 채움 또는 메뉴 검색';
        const accuracy = state.place?.accuracy;
        if (accuracy > ACCURACY_WARN_M) {
            message += ` · 위치 오차 ±${(accuracy / 1000).toFixed(1)}km — 위치 검색 권장`;
        }
        setStatus(message);
    } catch (e) {
        if (requestId !== state.requestId) return;
        state.pool = [];
        dropAutoCandidates();
        setStatus(e.message);
    } finally {
        if (requestId === state.requestId) setBusy(false);
    }
}

export function areaParams() {
    return new URLSearchParams({ lat: state.center.lat.toFixed(6), lng: state.center.lng.toFixed(6), radius: state.radius });
}

/** 반경 안 식당 중 뺀 곳·직접 넣은 곳 제외 */
function available() {
    return state.pool.filter((p) => !state.excluded.has(p.id) && !state.pinned.has(p.id));
}

/** 반경 안 식당 중 아직 안 올라간 곳 (뺀 곳 제외) */
export function spare() {
    const ids = new Set(state.candidates.map((p) => p.id));
    return available().filter((p) => !ids.has(p.id));
}

/**
 * pool 에서 need 곳을 뽑음. 영업중 필터가 켜져 있으면 뽑은 곳의 영업 상태를 확인하고
 * 못 가는 곳은 버린 뒤 모자란 만큼 다시 뽑는다 (가게마다 조회가 필요해 전체를 미리 거를 수 없음).
 */
async function pickFrom(pool, need, chosen) {
    if (!state.openOnly) return weightedPick(pool, need, chosen, state.types);

    const picked = [];
    const tried = new Set();
    for (let round = 0; round < 4 && picked.length < need; round++) {
        const left = pool.filter((p) => !tried.has(p.id) && !isShut(p));
        const batch = weightedPick(left, Math.min(HOURS_BATCH, need - picked.length), [...chosen, ...picked], state.types);
        if (!batch.length) break;
        batch.forEach((p) => tried.add(p.id));
        await ensureHours(batch);
        picked.push(...batch.filter((p) => !isShut(p)));
    }
    return picked;
}

/** 확인 중엔 키를 잠금 (영업 상태 조회 동안 두 번 누르기 방지) */
export async function checking(task) {
    state.checking = true;
    setBusy(true);
    try {
        return await task();
    } finally {
        state.checking = false;
        setBusy(false);
    }
}

/** 자동: 빈 칸을 반경 안 식당으로 채움 (보정된 무작위) */
export async function autoFill() {
    const need = state.slots - state.candidates.length;
    if (need <= 0 || state.checking) return;
    if (state.openOnly) setStatus('영업 상태 확인 중');
    const picks = await checking(() => pickFrom(spare(), need, state.candidates));
    state.candidates.push(...picks);
    clearResult();
    render();
    const what = state.openOnly ? '영업 중인 식당' : '식당';
    if (picks.length < need) setStatus(picks.length ? `잔여 ${picks.length}곳만 추가` : `추가 가능 ${what} 없음 — 반경·종류 변경`);
    else if (state.openOnly) setStatus(`자동 채움 ${picks.length}곳 · 영업 중`);
}

/** 섞기: 직접 넣은 곳은 두고, 자동으로 들어간 곳만 새로 뽑아 순서도 섞음 */
export async function reshuffle() {
    if (state.checking) return;
    const pins = state.candidates.filter((p) => state.pinned.has(p.id));
    const autoCount = state.candidates.length - pins.length;
    const rest = await checking(() => pickFrom(available(), autoCount, pins));
    state.candidates = shuffle([...pins, ...rest]);
    clearResult();
    render();
}

export function clearCandidates() {
    state.candidates = [];
    state.pinned.clear();
    clearResult();
    drawMarkers();
    render();
}

/** 다시 검색하면 자동으로 들어간 곳은 내리고 직접 넣은 곳만 남김 */
function dropAutoCandidates() {
    state.candidates = state.candidates.filter((p) => state.pinned.has(p.id));
    render();
}

export function exclude(id) {
    state.excluded.add(id);
    state.pinned.delete(id);
    state.candidates = state.candidates.filter((p) => p.id !== id);
    drawMarkers();
    render();
}

export function setSlots(n, save = true) {
    state.slots = Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, n));
    // 줄이면 자동으로 들어간 곳부터, 그다음 나중에 넣은 곳부터 내림
    while (state.candidates.length > state.slots) {
        const autoIndex = state.candidates.findLastIndex((p) => !state.pinned.has(p.id));
        const index = autoIndex !== -1 ? autoIndex : state.candidates.length - 1;
        const [removed] = state.candidates.splice(index, 1);
        state.pinned.delete(removed.id);
    }
    setCounter(el.slots, state.slots);
    if (save) {
        try { localStorage.setItem(KEYS.slots, String(state.slots)); } catch { /* 저장 못 해도 동작 */ }
    }
    clearResult();
    drawMarkers();
    render();
}

/** 만보기식 카운터: 바뀐 자리의 드럼만 굴림 */
function setCounter(counter, value) {
    const text = String(value).padStart(2, '0');
    const prev = Number(counter.dataset.value ?? value);
    const dir = value > prev ? 'is-up' : 'is-down';
    counter.querySelectorAll('.rl-drum__digit').forEach((digit, i) => {
        if (digit.textContent === text[i]) return;
        digit.textContent = text[i];
        digit.classList.remove('is-up', 'is-down');
        void digit.offsetWidth; // 애니메이션 다시 시작
        digit.classList.add(dir);
    });
    counter.dataset.value = String(value);
    counter.setAttribute('aria-label', `후보 수 ${text}`);
}

export function initSlots() {
    let saved = NaN;
    try { saved = Number(localStorage.getItem(KEYS.slots)); } catch { /* 비공개 모드 등 */ }
    setSlots(Number.isFinite(saved) && saved > 0 ? saved : SLOTS_DEFAULT, false);
}

/** 메뉴 찾기 결과를 후보(돌림판)에 넣는다. 자리가 없으면 무작위로 올라간 후보 하나와 바꾼다 */
export function addCandidate(place) {
    if (state.spinning) return;
    if (state.candidates.some((p) => p.id === place.id)) return;

    state.excluded.delete(place.id);

    if (state.candidates.length < state.slots) {
        state.candidates.push(place);
    } else {
        const swappable = state.candidates
            .map((p, i) => [p, i])
            .filter(([p]) => !state.pinned.has(p.id));
        if (!swappable.length) {
            setSearchStatus(`후보 가득 참 (${state.slots}/${state.slots}) — 후보 수 증가 또는 제외`);
            return;
        }
        const [, index] = swappable[Math.floor(Math.random() * swappable.length)];
        state.candidates.splice(index, 1, place);
    }

    state.pinned.set(place.id, place);
    clearResult();
    drawMarkers();
    render();
    setSearchStatus(`추가: #${state.candidates.findIndex((p) => p.id === place.id) + 1} ${place.name}`);
}
