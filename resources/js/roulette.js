/**
 * 점심 룰렛: 현재 위치 → 반경 안 식당 → 돌림판.
 * 식당 데이터는 서버(/restaurants)가 카카오 로컬 API로 조회한다. REST 키는 브라우저에 노출하지 않는다.
 *
 * 이 파일은 키·탭 이벤트 연결과 시작 순서만 담는다. 기능은 ./roulette/ 아래 모듈에:
 *   map(지도·위치) · places(조회·후보) · hours(영업 상태) · wheel(돌림판) · ticket(영수증·기록)
 *   list(SIDE A) · menu-search(SIDE B) · tabs · location-search(위치 검색) · readout(계기판) · render
 *   logic/ 은 DOM 없는 순수 로직 (tests/js 에서 node --test 로 검사)
 */
import { hydrateIcons } from './pixel-icons';
import { KEYS } from './roulette/constants.js';
import { $, el } from './roulette/dom.js';
import { initOpenOnly } from './roulette/hours.js';
import { initLocationSearch } from './roulette/location-search.js';
import { applyCenter, drawRadius, forgetPlace, initMap, locate, savedPlace } from './roulette/map.js';
import { initMenuSearch } from './roulette/menu-search.js';
import { autoFill, clearCandidates, exclude, fetchPlaces, initSlots, reshuffle, setSlots } from './roulette/places.js';
import { addNever } from './roulette/prefs.js';
import { initSaved } from './roulette/saved.js';
import { initTicketExtras } from './roulette/ticket-extras.js';
import { updateReadout } from './roulette/readout.js';
import { state } from './roulette/state.js';
import { clearResult, markLastResult, renderLog, setTicketIdle } from './roulette/ticket.js';
import { initTabs } from './roulette/tabs.js';
import { spin } from './roulette/wheel.js';
import { terminalInput } from './terminal-input';

/* ---------- CRT 효과 ---------- */

function setCrt(on, save = true) {
    $('map-screen').classList.toggle('is-crt', on);
    $('crt-toggle').setAttribute('aria-pressed', String(on));
    if (save) {
        try { localStorage.setItem(KEYS.crt, on ? 'on' : 'off'); } catch { /* 저장 못 해도 화면은 바뀜 */ }
    }
}

function initCrt() {
    let saved = null;
    try { saved = localStorage.getItem(KEYS.crt); } catch { /* 비공개 모드 등 */ }
    setCrt(saved !== 'off', false);
    $('crt-toggle').addEventListener('click', () => {
        setCrt($('crt-toggle').getAttribute('aria-pressed') !== 'true');
    });
}

/* ---------- 키 ---------- */

function initKeys() {
    el.spin.addEventListener('click', spin);
    el.shuffle.addEventListener('click', reshuffle);
    el.auto.addEventListener('click', autoFill);
    el.clear.addEventListener('click', clearCandidates);
    el.slotsDown.addEventListener('click', () => setSlots(state.slots - 1));
    el.slotsUp.addEventListener('click', () => setSlots(state.slots + 1));
    el.locate.addEventListener('click', () => {
        forgetPlace(); // 기기 위치로 돌아감
        locate();
    });

    el.resultExclude.addEventListener('click', () => {
        if (!state.winner) return;
        const id = state.winner.id;
        markLastResult('제외');
        clearResult();
        exclude(id);
        renderLog();
        spin();
    });
    // 다시 안 감: 앞으로 자동 채움·지도에서 빼고 바로 다시 돌림 (SIDE B 에서 해제)
    el.resultNever.addEventListener('click', () => {
        if (!state.winner) return;
        const place = state.winner;
        addNever(place);
        markLastResult('안 감');
        clearResult();
        exclude(place.id);
        renderLog();
        spin();
    });
    el.resultAgain.addEventListener('click', () => {
        if (!state.winner) return;
        markLastResult('재실행');
        renderLog();
        spin();
    });

    el.typeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const type = button.dataset.type;
            if (!type) state.types.clear(); // 전체
            else if (state.types.has(type)) state.types.delete(type);
            else state.types.add(type);

            el.typeButtons.forEach((b) => {
                const on = b.dataset.type ? state.types.has(b.dataset.type) : state.types.size === 0;
                b.setAttribute('aria-pressed', String(on));
            });
            updateReadout(); // 표시창 TYPE 은 조회를 기다리지 않고 바로
            if (state.center) fetchPlaces();
        });
    });

    el.radiusButtons.forEach((button) => {
        button.addEventListener('click', () => {
            state.radius = Number(button.dataset.radius);
            el.radiusButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
            if (state.center) {
                drawRadius();
                fetchPlaces();
            }
        });
    });
}

/* ---------- 시작 ---------- */

hydrateIcons();
terminalInput(el.locInput);
terminalInput(el.searchInput);
initTabs();
initKeys();
initLocationSearch();
initMenuSearch();
initSaved();
initTicketExtras();
initSlots();
initCrt();
initOpenOnly();
setTicketIdle();
renderLog();
initMap();
// 직접 고른 위치가 있으면 거기서 시작 (PC는 기기 위치가 부정확한 경우가 많음). 없으면 바로 현재 위치를 물음
const saved = savedPlace();
if (saved) applyCenter(saved.lat, saved.lng, { label: saved.label });
else locate();
