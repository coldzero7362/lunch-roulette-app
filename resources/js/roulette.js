import { hydrateIcons, pixelIcon } from './pixel-icons';
import { terminalInput } from './terminal-input';

/**
 * 점심 룰렛: 현재 위치 → 반경 안 식당 → 돌림판.
 * 식당 데이터는 서버(/restaurants)가 카카오 로컬 API로 조회한다. REST 키는 브라우저에 노출하지 않는다.
 */

const SLOTS_MIN = 2;  // 돌림판 칸 수 범위
const SLOTS_MAX = 12;
const SLOTS_DEFAULT = 8;
const SLOTS_KEY = 'lunch-roulette:slots';
const PLACE_KEY = 'lunch-roulette:place'; // 직접 고른 위치 (검색·지도 클릭)
const ACCURACY_WARN_M = 1000;             // 기기 위치 오차가 이보다 크면 안내
const LOG_KEY = 'lunch-roulette:log';     // 오늘 결과 기록 (날짜별)
const WALK_M_PER_MIN = 67;                 // 도보 약 4km/h
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 위치를 못 받을 때: 서울시청
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPIN_MS = REDUCED_MOTION ? 600 : 4500;
const CLOSEUP_LEVEL = 2; // 당첨 가게 클로즈업 (약 30m 축척, 묶음이 풀려 골목까지 보임)
// 카세트 스킨: 70년대 색 띠와 철판·라벨 색을 번갈아. ink = 그 위 글자색 (대비 확보)
const SLICES = [
    { fill: '#f2b632', ink: '#2b2620' },
    { fill: '#ddd6c4', ink: '#2b2620' },
    { fill: '#e0662a', ink: '#2b2620' },
    { fill: '#aba38f', ink: '#2b2620' },
    { fill: '#c8442a', ink: '#f5efe0' },
    { fill: '#e9e3d4', ink: '#2b2620' },
    { fill: '#6b3a1e', ink: '#f2b632' },
    { fill: '#c4bca8', ink: '#2b2620' },
];
const INK = '#2b2620';
const SIGNAL = '#d25a22';

const root = document.getElementById('roulette-app');
const $ = (id) => document.getElementById(id);
const el = {
    status: $('status'),
    locate: $('locate'),
    spin: $('spin'),
    shuffle: $('shuffle'),
    auto: $('auto'),
    clear: $('clear'),
    slots: $('slots'),
    slotsDown: $('slots-down'),
    slotsUp: $('slots-up'),
    rotor: $('wheel-rotor'),
    candidates: $('candidates'),
    count: $('candidate-count'),
    result: $('result'),
    resultName: $('result-name'),
    resultMeta: $('result-meta'),
    resultAddress: $('result-address'),
    resultLink: $('result-link'),
    resultRoute: $('result-route'),
    resultExclude: $('result-exclude'),
    resultAgain: $('result-again'),
    resultNo: $('result-no'),
    resultKicker: $('result-kicker'),
    resultTime: $('result-time'),
    log: $('result-log'),
    steps: [...document.querySelectorAll('#steps [data-step]')],
    fields: { loc: $('f-loc'), range: $('f-range'), type: $('f-type'), found: $('f-found'), wheel: $('f-wheel') },
    tabs: [$('tab-a'), $('tab-b')],
    radiusButtons: [...document.querySelectorAll('[data-radius]')],
    typeButtons: [...document.querySelectorAll('[data-type]')],
    searchForm: $('search-form'),
    searchInput: $('search-input'),
    searchStatus: $('search-status'),
    searchResults: $('search-results'),
    locForm: $('loc-form'),
    locInput: $('loc-input'),
    locResults: $('loc-results'),
    locPop: $('loc-pop'),
    locHead: $('loc-head'),
    locClose: $('loc-close'),
};

const state = {
    center: null,
    place: null,         // 지금 중심이 어디서 왔는지 { label, accuracy }
    radius: 500,
    pool: [],            // 반경 안 전체 식당
    poolLoaded: false,   // 반경 검색을 한 번이라도 마쳤는지 (단계 표시등)
    excluded: new Set(), // 사용자가 뺀 식당 id
    candidates: [],      // 돌림판에 올라간 식당
    slots: SLOTS_DEFAULT, // 돌림판 칸 수
    types: new Set(),    // 고른 종류 (비면 전체)
    price: { min: 0, max: 30000 }, // 1인 가격대 (max 30000 = 상한 없음). 걸러내기는 가격 데이터가 생기면 연결
    pinned: new Map(),   // 메뉴 찾기로 직접 넣은 식당 (id → place). 섞어도 빠지지 않음
    searchResults: [],
    rotation: 0,
    spinning: false,
    winner: null,
    requestId: 0,
};

let map, centerOverlay, radiusCircle, winnerOverlay, winnerMarker, clusterer;
let placeMarkers = [];

/* ---------- 지도 ---------- */

function initMap() {
    if (!window.kakao?.maps) {
        setStatus('지도 로드 실패 — 새로고침');
        return;
    }

    kakao.maps.load(() => {
        map = new kakao.maps.Map($('map'), {
            center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: 4,
        });
        clusterer = createClusterer();

        kakao.maps.event.addListener(map, 'click', (e) => {
            choosePlace(e.latLng.getLat(), e.latLng.getLng(), '지도 선택 지점');
        });

        if (pendingCenter) {
            setCenter(pendingCenter.lat, pendingCenter.lng, pendingCenter.place);
            pendingCenter = null;
        }
    });
}

// 지도가 준비되기 전에 받은 위치는 여기 두었다가 지도가 뜨면 적용
let pendingCenter = null;
let locating = false;

function getPosition(options) {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

/**
 * 현재 위치를 받아 지도 가운데로. 정밀 위치가 실패하면(시간 초과·찾지 못함) 대략적인 위치로 한 번 더 시도한다.
 * 페이지를 열 때 한 번, 내 위치 키를 누를 때마다 부른다.
 */
async function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
        setStatus('위치 사용 불가(HTTP) — 지도 선택 또는 위치 검색');
        return;
    }
    if (locating) return;

    locating = true;
    el.locate.disabled = true;
    setStatus('위치 확인 중');

    try {
        let pos;
        try {
            pos = await getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
        } catch (e) {
            if (e.code === 1) throw e; // 권한 거부는 다시 물어도 같다
            setStatus('정밀 위치 실패 — 대략 위치로 재시도');
            pos = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        }
        applyCenter(pos.coords.latitude, pos.coords.longitude, { label: '현재 위치', accuracy: pos.coords.accuracy });
    } catch (e) {
        setStatus(locateErrorMessage(e));
    } finally {
        locating = false;
        el.locate.disabled = false;
    }
}

function locateErrorMessage(e) {
    switch (e?.code) {
        case 1: return '위치 권한 없음 — 주소창 자물쇠에서 허용, 또는 지도 선택';
        case 2: return '위치 확인 불가 — 기기 위치 서비스 확인, 또는 지도 선택';
        case 3: return '위치 응답 시간 초과 — 재시도 또는 지도 선택';
        default: return '위치 확인 실패 — 지도 선택 또는 위치 검색';
    }
}

function applyCenter(lat, lng, place = null) {
    if (!map) {
        pendingCenter = { lat, lng, place };
        return;
    }
    setCenter(lat, lng, place);
}

/** @param place {label, accuracy} 상태 표시에 쓰는 출처 정보 */
function setCenter(lat, lng, place = null) {
    state.center = { lat, lng };
    state.place = place;
    updateReadout();
    const pos = new kakao.maps.LatLng(lat, lng);

    centerOverlay?.setMap(null);
    centerOverlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: '<div style="width:16px;height:16px;border-radius:50%;background:#d25a22;border:3px solid #e9e3d4;box-shadow:0 0 0 2px #2b2620"></div>',
        zIndex: 3,
    });
    centerOverlay.setMap(map);

    drawRadius();
    map.panTo(pos);
    fetchPlaces();
}

function drawRadius() {
    radiusCircle?.setMap(null);
    if (!state.center) return;

    radiusCircle = new kakao.maps.Circle({
        center: new kakao.maps.LatLng(state.center.lat, state.center.lng),
        radius: state.radius,
        strokeWeight: 2,
        strokeColor: SIGNAL,
        strokeOpacity: 0.9,
        strokeStyle: 'shortdash',
        fillColor: SIGNAL,
        fillOpacity: 0.07,
    });
    radiusCircle.setMap(map);
    map.setLevel(radiusLevel());
}

/** 반경 원이 다 보이는 지도 레벨 */
function radiusLevel() {
    return state.radius >= 1000 ? 6 : state.radius >= 500 ? 5 : 4;
}

/** 당첨 가게로 이동한 뒤 가까이 확대 */
function closeUp(pos) {
    if (REDUCED_MOTION) {
        map.setLevel(CLOSEUP_LEVEL);
        map.setCenter(pos);
        return;
    }
    map.panTo(pos);
    // 이동이 끝난 뒤 지도 가운데(=가게)를 기준으로 부드럽게 확대
    setTimeout(() => map.setLevel(CLOSEUP_LEVEL, { animate: { duration: 600 } }), 450);
}

/** 클로즈업했던 지도를 반경 전체가 보이게 되돌림 */
function restoreView() {
    if (!map || !state.center) return;
    const center = new kakao.maps.LatLng(state.center.lat, state.center.lng);
    if (REDUCED_MOTION) {
        map.setLevel(radiusLevel());
        map.setCenter(center);
        return;
    }
    // 확대·이동 애니메이션을 동시에 걸면 이동이 묻히므로 축소가 끝난 뒤 이동
    map.setLevel(radiusLevel(), { animate: { duration: 400 } });
    setTimeout(() => map.panTo(center), 420);
}

/**
 * 가까운 마커는 개수가 적힌 원 하나로 묶는다 (번화가는 반경 안 식당이 수백 곳이라 핀이 겹침).
 * 지도를 확대하면(레벨 3 이하) 낱개 핀으로 풀린다.
 */
function createClusterer() {
    const style = (size, bg, font) => ({
        width: `${size}px`, height: `${size}px`, lineHeight: `${size - 4}px`,
        background: bg, color: '#2b2620', border: '2px solid #2b2620', borderRadius: '50%',
        textAlign: 'center', font: `${font}px/${size - 4}px 'Mulmaru Mono', monospace`,
        boxShadow: '0 3px 0 rgb(43 38 32 / .45)',
    });
    return new kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 4,
        gridSize: 56,
        calculator: [10, 40],
        // 바탕만 10% 투명 (숫자·테두리는 그대로 선명하게): 아래 지도 글자가 살짝 비침
        styles: [style(34, 'rgb(242 182 50 / .9)', 13), style(42, 'rgb(224 102 42 / .9)', 14), style(50, 'rgb(200 68 42 / .9)', 15)],
    });
}

function drawMarkers() {
    if (!map) return;
    const shown = new Map(state.pool.map((p) => [p.id, p]));
    state.pinned.forEach((p, id) => shown.set(id, p));
    placeMarkers = [...shown.values()]
        .filter((p) => !state.excluded.has(p.id))
        .map((p) => new kakao.maps.Marker({
            position: new kakao.maps.LatLng(p.lat, p.lng),
            title: p.name,
            image: markerImage(),
        }));
    clusterer.clear();
    clusterer.addMarkers(placeMarkers);
}

let pin;
/** 카세트 스킨 핀: 번트 오렌지 몸통, 카본 테두리, 베이지 점 */
function markerImage() {
    if (!pin) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
            + '<path d="M13 32 C13 32 2 19 2 12 A11 11 0 0 1 24 12 C24 19 13 32 13 32 Z" fill="#d25a22" stroke="#2b2620" stroke-width="2.5"/>'
            + '<rect x="9" y="8" width="8" height="8" fill="#e9e3d4" stroke="#2b2620" stroke-width="1.5"/></svg>';
        pin = new kakao.maps.MarkerImage(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            new kakao.maps.Size(26, 34),
            { offset: new kakao.maps.Point(13, 33) },
        );
    }
    return pin;
}

function highlightWinner(place) {
    winnerOverlay?.setMap(null);
    winnerMarker?.setMap(null);
    const label = document.createElement('div');
    label.textContent = `▶ ${place.name}`;
    label.style.cssText = "padding:7px 10px;border:2px solid #3f382f;border-radius:4px;background:#0e120f;color:#ffb23f;text-shadow:0 0 6px rgb(255 178 63 / .6);font:14px/1 'Mulmaru',monospace;letter-spacing:.04em;white-space:nowrap;transform:translateY(-54px);box-shadow:0 0 0 1.5px #2b2620";

    const pos = new kakao.maps.LatLng(place.lat, place.lng);
    // 당첨 핀은 묶음(클러스터)에 넣지 않고 따로 띄워 항상 보이게
    winnerMarker = new kakao.maps.Marker({ position: pos, title: place.name, image: markerImage(), zIndex: 4, map });
    winnerOverlay = new kakao.maps.CustomOverlay({ position: pos, content: label, zIndex: 5 });
    winnerOverlay.setMap(map);
    closeUp(pos);
}

/* ---------- 데이터 ---------- */

async function fetchPlaces() {
    if (!state.center) return;

    const requestId = ++state.requestId;
    setStatus('반경 내 식당 조회 중');
    setBusy(true);

    const url = new URL(root.dataset.restaurantsUrl);
    url.search = areaParams();
    state.types.forEach((t) => url.searchParams.append('types[]', t));

    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
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

function areaParams() {
    return new URLSearchParams({ lat: state.center.lat.toFixed(6), lng: state.center.lng.toFixed(6), radius: state.radius });
}

function radiusLabel() {
    return state.radius >= 1000 ? `${state.radius / 1000}km` : `${state.radius}m`;
}

/** 카카오 분류 이름 → 화면 이름 */
function typeLabel(type) {
    return type === '술집' ? '주점' : type;
}

function available() {
    return state.pool.filter((p) => !state.excluded.has(p.id) && !state.pinned.has(p.id));
}

function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function onWheel() {
    return new Set(state.candidates.map((p) => p.id));
}

/** 반경 안 식당 중 아직 안 올라간 곳 (뺀 곳 제외) */
function spare() {
    const ids = onWheel();
    return available().filter((p) => !ids.has(p.id));
}

/**
 * 자동 채움 보정: 가중치를 둔 무작위.
 * - 돌림판에 이미 있는 세부 분류(예: 육류,고기)와 같으면 확률을 크게 낮춤 → 한 종류로 쏠리지 않게
 * - '전체'일 때 같은 큰 분류(한식 등)가 많으면 조금 낮춤
 * - 주점은 점심 후보로 덜 맞아 낮춤 (종류에서 주점을 직접 고르면 보정 안 함)
 */
function weightOf(place, chosen) {
    let w = 1;
    if (place.type === '술집' && !state.types.has('술집')) w *= 0.15;
    const sameCategory = chosen.filter((p) => p.category === place.category).length;
    w /= 1 + 5 * sameCategory;
    if (!state.types.size) {
        const sameType = chosen.filter((p) => p.type === place.type).length;
        w /= 1 + 0.6 * sameType;
    }
    return w;
}

/** pool 에서 n곳을 하나씩 가중치 무작위로 뽑음. chosen 은 이미 돌림판에 있는 곳 */
function weightedPick(pool, n, chosen = []) {
    const left = [...pool];
    const picked = [];
    while (picked.length < n && left.length) {
        const weights = left.map((p) => weightOf(p, [...chosen, ...picked]));
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        let i = 0;
        while (i < left.length - 1 && (r -= weights[i]) > 0) i++;
        picked.push(left.splice(i, 1)[0]);
    }
    return picked;
}

/** 자동: 빈 칸을 반경 안 식당으로 채움 (보정된 무작위) */
function autoFill() {
    const need = state.slots - state.candidates.length;
    if (need <= 0) return;
    const picks = weightedPick(spare(), need, state.candidates);
    state.candidates.push(...picks);
    clearResult();
    render();
    if (picks.length < need) setStatus(picks.length ? `잔여 ${picks.length}곳만 추가` : '추가 가능 식당 없음 — 반경·종류 변경');
}

/** 섞기: 직접 넣은 곳은 두고, 자동으로 들어간 곳만 새로 뽑아 순서도 섞음 */
function reshuffle() {
    const pins = state.candidates.filter((p) => state.pinned.has(p.id));
    const autoCount = state.candidates.length - pins.length;
    const rest = weightedPick(available(), autoCount, pins);
    state.candidates = shuffle([...pins, ...rest]);
    clearResult();
    render();
}

function clearCandidates() {
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

function exclude(id) {
    state.excluded.add(id);
    state.pinned.delete(id);
    state.candidates = state.candidates.filter((p) => p.id !== id);
    drawMarkers();
    render();
}

function setSlots(n, save = true) {
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
        try { localStorage.setItem(SLOTS_KEY, String(state.slots)); } catch { /* 저장 못 해도 동작 */ }
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

function initSlots() {
    let saved = NaN;
    try { saved = Number(localStorage.getItem(SLOTS_KEY)); } catch { /* 비공개 모드 등 */ }
    setSlots(Number.isFinite(saved) && saved > 0 ? saved : SLOTS_DEFAULT, false);
}

/** 메뉴 찾기 결과를 후보(돌림판)에 넣는다. 자리가 없으면 무작위로 올라간 후보 하나와 바꾼다 */
function addCandidate(place) {
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

/* ---------- 위치 찾기 · 기억 ---------- */

/** 직접 고른 위치: 중심으로 쓰고 다음 방문 때도 여기서 시작 */
function choosePlace(lat, lng, label) {
    try { localStorage.setItem(PLACE_KEY, JSON.stringify({ lat, lng, label })); } catch { /* 저장 못 해도 동작 */ }
    applyCenter(lat, lng, { label });
}

function savedPlace() {
    try {
        const p = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null');
        return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
    } catch {
        return null;
    }
}

function forgetPlace() {
    try { localStorage.removeItem(PLACE_KEY); } catch { /* 무시 */ }
}

let locItems = [];   // 지금 결과 목록 (위치 검색)
let locActive = -1;  // 키보드로 고른 줄

function showLocPop(head) {
    el.locHead.textContent = head;
    el.locPop.hidden = false;
    el.locInput.setAttribute('aria-expanded', 'true');
}

function hideLocResults() {
    el.locPop.hidden = true;
    el.locResults.replaceChildren();
    el.locInput.setAttribute('aria-expanded', 'false');
    el.locInput.removeAttribute('aria-activedescendant');
    locItems = [];
    locActive = -1;
}

/** 이름에서 검색어 부분을 강조 (공백 무시, 대소문자 무시) */
function highlight(text, query) {
    const q = query.replace(/\s+/g, '').toLowerCase();
    const frag = document.createDocumentFragment();
    if (!q) { frag.append(text); return frag; }
    // 공백을 뺀 위치 ↔ 원문 위치 대응
    const map = [];
    let flat = '';
    [...text].forEach((ch, i) => { if (!/\s/.test(ch)) { map.push(i); flat += ch.toLowerCase(); } });
    const at = flat.indexOf(q);
    if (at === -1) { frag.append(text); return frag; }
    const chars = [...text];
    const from = map[at];
    const to = map[at + q.length - 1] + 1;
    const mark = document.createElement('mark');
    mark.className = 'rl-hit';
    mark.textContent = chars.slice(from, to).join('');
    frag.append(chars.slice(0, from).join(''), mark, chars.slice(to).join(''));
    return frag;
}

function setLocActive(i) {
    const rows = [...el.locResults.querySelectorAll('.rl-locate__item')];
    if (!rows.length) return;
    locActive = (i + rows.length) % rows.length;
    rows.forEach((r, k) => r.setAttribute('aria-selected', String(k === locActive)));
    el.locInput.setAttribute('aria-activedescendant', rows[locActive].id);
    rows[locActive].scrollIntoView({ block: 'nearest' });
}

function pickLocation(loc) {
    el.locInput.value = loc.name;
    hideLocResults();
    choosePlace(loc.lat, loc.lng, loc.name);
}

async function searchLocation(query) {
    if (!query) return;

    const note = (head, text) => {
        const li = document.createElement('li');
        li.className = 'rl-locate__note';
        li.textContent = text;
        el.locResults.replaceChildren(li);
        locItems = [];
        locActive = -1;
        showLocPop(head);
    };
    note('SEARCH', `'${query}' 검색 중`);

    const url = new URL(root.dataset.locationsUrl);
    url.searchParams.set('q', query);

    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 429 ? '요청 초과 — 60초 후 재시도' : body.message ?? '위치 조회 실패 — 재시도');

        const locations = body.locations ?? [];
        if (!locations.length) {
            note('RESULT 0건', `'${query}' 0건 — 역·건물명 또는 도로명 주소 입력`);
            return;
        }

        locItems = locations;
        el.locResults.replaceChildren(...locations.map((loc, i) => {
            const li = document.createElement('li');
            li.className = 'rl-locate__item';
            li.id = `loc-opt-${i}`;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');

            const no = document.createElement('span');
            no.className = 'rl-locate__no';
            no.textContent = String(i + 1).padStart(2, '0');
            no.setAttribute('aria-hidden', 'true');

            const body = document.createElement('div');
            body.className = 'min-w-0';
            const name = document.createElement('p');
            name.className = 'rl-track__name truncate';
            name.append(highlight(loc.name, query));

            const meta = document.createElement('p');
            meta.className = 'rl-track__meta truncate';
            const tag = document.createElement('span');
            tag.className = 'rl-tag';
            tag.textContent = loc.kind === 'address' ? '주소' : loc.kind || '장소';
            meta.append(tag, loc.kind === 'address' ? '' : loc.address);

            body.append(name, meta);
            li.append(no, body);
            li.addEventListener('click', () => pickLocation(loc));
            li.addEventListener('mousemove', () => { if (locActive !== i) setLocActive(i); });
            return li;
        }));
        showLocPop(`RESULT ${locations.length}건`);
    } catch (e) {
        note('ERROR', e.message);
    }
}

/* ---------- 메뉴 찾기 ---------- */

async function searchMenu(query) {
    if (!query) return;
    if (!state.center) {
        setSearchStatus('위치 미설정 — 01 LOC 먼저');
        return;
    }

    setSearchStatus(`'${query}' 검색 중`);
    el.searchResults.replaceChildren();

    const url = new URL(root.dataset.searchUrl);
    url.search = areaParams();
    url.searchParams.set('q', query);

    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(res.status === 429 ? '요청 초과 — 60초 후 재시도' : body.message ?? '검색 실패 — 재시도');
        }
        state.searchResults = body.places ?? [];
        setSearchStatus(state.searchResults.length
            ? `'${query}' ${state.searchResults.length}건 · 반경 ${radiusLabel()}`
            : `'${query}' 0건 — 반경 확대`);
        renderSearchResults();
    } catch (e) {
        state.searchResults = [];
        setSearchStatus(e.message);
    }
}

/** 카카오맵 가게 페이지 (없으면 좌표로 지도 열기) */
function placeUrl(place) {
    return place.url || `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
}

/** 목록 줄 오른쪽 정사각 아이콘 키 (글자 대신 픽셀 아이콘. 이름은 aria-label·툴팁으로) */
function iconKey(tag, icon, label, tip) {
    const key = document.createElement(tag);
    key.className = 'rl-key rl-key--beige rl-key--sq';
    if (tag === 'button') key.type = 'button';
    key.setAttribute('aria-label', label);
    key.title = tip;
    key.append(pixelIcon(icon));
    return key;
}

/** 키 묶음을 매립 홈(.rl-well)에 담음 */
function well(...keys) {
    const w = document.createElement('span');
    w.className = 'rl-well';
    w.append(...keys);
    return w;
}

/** [상세]: 카카오맵 가게 페이지를 새 탭으로 */
function detailLink(place) {
    const a = iconKey('a', 'external-link', `${place.name} 카카오맵에서 보기 (새 탭)`, '상세 · 카카오맵');
    a.href = placeUrl(place);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
}

/** 메뉴 일부로만 걸린 곳 (서버 등급: menu / pub) */
const isPartial = (place) => place.match === 'menu' || place.match === 'pub';

function renderSearchResults() {
    const rows = [];
    let sepAdded = false;
    state.searchResults.forEach((place) => {
        if (isPartial(place) && !sepAdded) {
            // 분류 태그·이름이 안 맞는 결과는 구분줄 아래로
            const sep = document.createElement('li');
            sep.className = 'rl-search__sep';
            sep.textContent = '— 부분 일치 · 메뉴 일부 —';
            rows.push(sep);
            sepAdded = true;
        }
        rows.push(searchRow(place));
    });
    el.searchResults.replaceChildren(...rows);
}

function searchRow(place) {
        const li = document.createElement('li');
        li.className = isPartial(place) ? 'rl-track rl-track--partial' : 'rl-track';

        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const name = document.createElement('p');
        name.className = 'rl-track__name truncate';
        name.textContent = place.name;
        const meta = metaLine(place, false);
        if (isPartial(place)) {
            const tag = document.createElement('span');
            tag.className = 'rl-tag rl-tag--dim';
            tag.textContent = '부분';
            meta.prepend(tag);
        }
        info.append(name, meta);

        const slot = state.candidates.findIndex((p) => p.id === place.id);
        if (slot !== -1) {
            const on = document.createElement('span');
            on.className = 'rl-track__on';
            on.textContent = `#${slot + 1}`;
            on.setAttribute('aria-label', `후보 ${slot + 1}번에 있음`);
            li.append(info, well(detailLink(place)), on);
            return li;
        }

        const add = iconKey('button', 'plus', `${place.name} 후보 추가`, '후보 추가');
        add.disabled = state.spinning;
        add.addEventListener('click', () => addCandidate(place));

        li.append(info, well(detailLink(place), add));
        return li;
}

function setSearchStatus(message) {
    el.searchStatus.textContent = message;
}

/** "[직접] [한식] 국밥 · 120m" */
function metaLine(place, pinned) {
    const meta = document.createElement('p');
    meta.className = 'rl-track__meta truncate';
    if (pinned) {
        const pin = document.createElement('span');
        pin.className = 'rl-tag rl-tag--pin';
        pin.textContent = '수동';
        meta.append(pin);
    }
    if (place.type) {
        const tag = document.createElement('span');
        tag.className = 'rl-tag';
        tag.textContent = typeLabel(place.type);
        meta.append(tag);
    }
    const detail = place.category && place.category !== place.type ? `${place.category} · ` : '';
    meta.append(`${detail}${place.distance}m`);
    return meta;
}

/* ---------- 돌림판 ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function point(deg, r) {
    // 0° = 12시 방향, 시계 방향
    const rad = (deg * Math.PI) / 180;
    return [Math.sin(rad) * r, -Math.cos(rad) * r];
}

function renderWheel() {
    const n = state.candidates.length;
    el.rotor.replaceChildren();

    if (n === 0) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('r', '98');
        c.setAttribute('fill', '#3f382f');
        el.rotor.append(c, reelHub());
        return;
    }

    const slice = 360 / n;
    state.candidates.forEach((place, i) => {
        const g = document.createElementNS(SVG_NS, 'g');
        const shape = document.createElementNS(SVG_NS, n === 1 ? 'circle' : 'path');

        if (n === 1) {
            shape.setAttribute('r', '98');
        } else {
            const [x1, y1] = point(i * slice, 98);
            const [x2, y2] = point((i + 1) * slice, 98);
            shape.setAttribute('d', `M0 0 L${x1} ${y1} A98 98 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2} Z`);
        }
        const tone = SLICES[i % SLICES.length];
        shape.setAttribute('fill', tone.fill);
        shape.setAttribute('stroke', INK);
        shape.setAttribute('stroke-width', '1.2');

        // 조각엔 번호만 (이름은 SIDE A 목록에 같은 번호로). 잘리거나 뒤집혀 읽기 어려운 문제를 없앰
        const mid = (i + 0.5) * slice;
        const [tx, ty] = point(mid, n > 8 ? 78 : 72);
        const text = document.createElementNS(SVG_NS, 'text');
        text.textContent = String(i + 1);
        text.setAttribute('x', tx.toFixed(1));
        text.setAttribute('y', ty.toFixed(1));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', n > 8 ? '15' : n > 4 ? '20' : '24');
        text.setAttribute('font-family', "'Mulmaru Mono', monospace");
        text.setAttribute('fill', tone.ink);
        text.classList.add('rl-wheel__no');
        text.style.transform = `rotate(${-state.rotation}deg)`; // 멈춘 돌림판 기준으로 똑바로

        g.append(shape, text);
        el.rotor.append(g);
    });

    el.rotor.append(reelHub());
}

/** 돌림판이 멈추면 칸 번호를 다시 똑바로 세움 (돌아간 채로 두면 6과 9가 헷갈림) */
function uprightNumbers() {
    el.rotor.querySelectorAll('.rl-wheel__no').forEach((t) => {
        t.style.transform = `rotate(${-state.rotation}deg)`;
    });
}

/** 가운데 카세트 릴 허브: 톱니 6개. 돌림판과 같이 돈다 */
function reelHub() {
    const g = document.createElementNS(SVG_NS, 'g');
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('r', '19');
    ring.setAttribute('fill', '#ddd6c4');
    ring.setAttribute('stroke', INK);
    ring.setAttribute('stroke-width', '3');
    const hole = document.createElementNS(SVG_NS, 'circle');
    hole.setAttribute('r', '11');
    hole.setAttribute('fill', '#1d1a16');
    g.append(ring, hole);
    for (let k = 0; k < 6; k++) {
        const tooth = document.createElementNS(SVG_NS, 'rect');
        tooth.setAttribute('x', '-2.2');
        tooth.setAttribute('y', '-12');
        tooth.setAttribute('width', '4.4');
        tooth.setAttribute('height', '5');
        tooth.setAttribute('fill', '#ddd6c4');
        tooth.setAttribute('transform', `rotate(${k * 60})`);
        g.append(tooth);
    }
    return g;
}

function spin() {
    const n = state.candidates.length;
    if (state.spinning || n === 0) return;

    state.spinning = true;
    clearResult();
    setBusy(true);
    setStatus('SPIN');

    const slice = 360 / n;
    const index = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * slice * 0.7;
    // 조각 index 의 가운데가 12시(바늘)에 오도록
    const target = -((index + 0.5) * slice) + jitter;
    const current = ((state.rotation % 360) + 360) % 360;
    const delta = (((target - current) % 360) + 360) % 360;
    state.rotation += 360 * 6 + delta;

    el.rotor.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
    el.rotor.style.transform = `rotate(${state.rotation}deg)`;

    setTimeout(() => {
        state.spinning = false;
        setBusy(false);
        uprightNumbers();
        showResult(state.candidates[index]);
    }, SPIN_MS + 50);
}

/* ---------- 화면 ---------- */

function showResult(place) {
    state.winner = place;
    const log = readLog();
    log.unshift({ t: hhmm(new Date()), name: place.name, act: '당첨' });
    writeLog(log);

    const walk = Math.max(1, Math.round(place.distance / WALK_M_PER_MIN));
    el.resultTime.textContent = `LR-01 · ${hhmm(new Date())}`;
    el.resultNo.textContent = `NO.${String(log.filter((e) => e.act !== '-').length).padStart(2, '0')}`;
    el.result.classList.remove('is-idle');
    el.resultKicker.textContent = 'RESULT';
    el.resultName.textContent = place.name;
    el.resultName.title = place.name;
    el.resultMeta.textContent = [typeLabel(place.type), place.category !== place.type ? place.category : '', `${place.distance}m`, `도보 약 ${walk}분`].filter(Boolean).join(' · ');
    el.resultAddress.textContent = [place.address, place.phone].filter(Boolean).join(' · ');
    el.resultRoute.href = `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
    el.resultLink.href = placeUrl(place);
    setTicketActions(true);
    setStatus(`RESULT — #${state.candidates.findIndex((p) => p.id === place.id) + 1} ${place.name}`);
    renderLog();
    highlightWinner(place);
    updateSteps();
    // 영수증(프린터 칸)으로 스크롤
    el.result.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
}

/* ---------- 오늘 기록 ---------- */

function hhmm(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function logKey() {
    const d = new Date();
    return `${LOG_KEY}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readLog() {
    try {
        const list = JSON.parse(localStorage.getItem(logKey()) ?? '[]');
        return Array.isArray(list) ? list.slice(0, 20) : [];
    } catch {
        return [];
    }
}

function writeLog(list) {
    try { localStorage.setItem(logKey(), JSON.stringify(list.slice(0, 20))); } catch { /* 저장 못 해도 동작 */ }
}

/** 가장 최근 당첨 기록의 처리 결과를 바꿈 (제외 / 재실행) */
function markLastResult(act) {
    const log = readLog();
    if (log[0]?.act === '당첨') {
        log[0].act = act;
        writeLog(log);
    }
}

const LOG_ROWS = 5;

/** 최근 5건. 빈 줄도 채워서 칸 높이가 늘 같게 */
function renderLog() {
    const log = readLog().slice(0, LOG_ROWS);
    const blanks = Array.from({ length: LOG_ROWS - log.length }, () => {
        const li = document.createElement('li');
        li.className = 'rl-log__empty';
        li.textContent = '--:--  ------';
        li.setAttribute('aria-hidden', 'true');
        return li;
    });
    el.log.replaceChildren(...log.map((e) => {
        const li = document.createElement('li');
        const t = document.createElement('span');
        t.textContent = e.t;
        const name = document.createElement('span');
        name.textContent = e.name;
        const act = document.createElement('span');
        act.className = e.act === '당첨' ? 'rl-log__act rl-log__act--win' : 'rl-log__act';
        act.textContent = e.act;
        li.append(t, name, act);
        return li;
    }), ...blanks);
}

/** 티켓 키 켜고 끄기 (링크는 aria-disabled 로) */
function setTicketActions(on) {
    [el.resultRoute, el.resultLink].forEach((a) => {
        if (on) { a.removeAttribute('aria-disabled'); a.removeAttribute('tabindex'); }
        else { a.setAttribute('aria-disabled', 'true'); a.setAttribute('tabindex', '-1'); a.removeAttribute('href'); }
    });
    el.resultExclude.disabled = !on;
    el.resultAgain.disabled = !on;
}

/** 프린터 칸을 대기 티켓으로 (자리는 그대로 두어 아래가 밀리지 않게) */
function setTicketIdle() {
    el.result.classList.add('is-idle');
    el.resultTime.textContent = 'LR-01 · --:--';
    el.resultNo.textContent = 'NO.--';
    el.resultKicker.textContent = state.spinning ? 'SPIN' : 'STANDBY';
    el.resultName.textContent = '—';
    el.resultName.removeAttribute('title');
    el.resultMeta.textContent = state.candidates.length >= 1 ? '▶ 돌리기 대기' : '후보 추가 → ▶ 돌리기';
    el.resultAddress.textContent = '\u00a0';
    setTicketActions(false);
}

function clearResult() {
    if (state.winner) restoreView(); // 클로즈업 상태였으면 반경 전체로
    state.winner = null;
    setTicketIdle();
    winnerOverlay?.setMap(null);
    winnerMarker?.setMap(null);
}

function renderCandidates() {
    el.count.textContent = `${state.candidates.length}/${state.slots}`;

    if (!state.candidates.length) {
        const li = document.createElement('li');
        li.className = 'rl-track__empty';
        li.textContent = state.center ? 'EMPTY — 자동 채움 또는 SIDE B 메뉴 검색' : 'NO LOC — 01 LOC 위치 설정 필요';
        el.candidates.replaceChildren(li);
        return;
    }

    el.candidates.replaceChildren(...state.candidates.map((place, i) => {
        const tone = SLICES[i % SLICES.length];
        const li = document.createElement('li');
        li.className = 'rl-track';

        // 트랙 번호: 돌림판 조각과 같은 색
        const no = document.createElement('span');
        no.className = 'rl-track__no';
        no.textContent = String(i + 1);
        no.style.background = tone.fill;
        no.style.color = tone.ink;

        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const name = document.createElement('p');
        name.className = 'rl-track__name truncate';
        name.textContent = place.name;
        info.append(name, metaLine(place, state.pinned.has(place.id)));

        const remove = iconKey('button', 'close', `${place.name} 후보에서 제외`, '제외');
        remove.disabled = state.spinning;
        remove.addEventListener('click', () => exclude(place.id));

        li.append(no, info, well(detailLink(place), remove));
        return li;
    }));
}

function render() {
    renderWheel();
    renderCandidates();
    if (state.searchResults.length) renderSearchResults();
    setBusy(state.spinning);
    updateReadout();
    if (!state.winner) setTicketIdle(); // 대기 문구를 후보 상태에 맞춤
}

/** 상태 CRT 칸: LOC / RANGE / TYPE / FOUND / WHEEL */
function updateReadout() {
    el.fields.loc.textContent = state.place?.label ?? (state.center ? '좌표 지정' : '—');
    el.fields.range.textContent = radiusLabel();
    el.fields.type.textContent = state.types.size ? [...state.types].map(typeLabel).join(' · ') : '전체';
    el.fields.found.textContent = state.poolLoaded ? `${state.pool.length}건` : '—';
    el.fields.wheel.textContent = `${state.candidates.length}/${state.slots}`;
    updateSteps();
}

/** 단계 표시등: 끝난 단계 녹색, 다음 할 단계 앰버 */
function updateSteps() {
    const done = {
        loc: !!state.center,
        cond: state.poolLoaded,
        cand: state.candidates.length >= 2,
        spin: !!state.winner,
    };
    let nowSet = false;
    el.steps.forEach((li) => {
        const key = li.dataset.step;
        let st = done[key] ? 'done' : 'off';
        if (!done[key] && !nowSet) { st = 'now'; nowSet = true; }
        li.dataset.state = st;
    });
}

function setBusy(busy) {
    const empty = state.candidates.length === 0;
    const autoOnWheel = state.candidates.some((p) => !state.pinned.has(p.id));
    const hasSpare = spare().length > 0;
    el.spin.disabled = busy || empty;
    el.auto.disabled = busy || state.candidates.length >= state.slots || !hasSpare;
    el.shuffle.disabled = busy || state.candidates.length < 2 && !(autoOnWheel && hasSpare);
    el.clear.disabled = busy || empty;
    el.slotsDown.disabled = busy || state.slots <= SLOTS_MIN;
    el.slotsUp.disabled = busy || state.slots >= SLOTS_MAX;
    el.candidates.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
}

function setStatus(message) {
    el.status.textContent = message;
}

/* ---------- 가격대 페이더 ---------- */

const PRICE_KEY = 'lunch-roulette:price';
const PRICE_MAX = 30000;
const PRICE_STEP = 1000;

function won(v) {
    return `₩${v.toLocaleString('ko-KR')}`;
}

function renderPrice() {
    const { min, max } = state.price;
    const lo = $('price-min');
    const hi = $('price-max');
    lo.value = min;
    hi.value = max;
    // 레일 위 켜진 구간
    const fill = $('price-fill');
    fill.style.left = `${(min / PRICE_MAX) * 100}%`;
    fill.style.width = `${((max - min) / PRICE_MAX) * 100}%`;
    const open = max >= PRICE_MAX;
    $('price-out').textContent = min === 0 && open ? '전체'
        : open ? `${won(min)} 이상`
        : `${won(min)} – ${won(max)}`;
    lo.setAttribute('aria-valuetext', won(min));
    hi.setAttribute('aria-valuetext', open ? '상한 없음' : won(max));
    // 두 캡이 끝에서 겹치면 움직일 수 있는 쪽을 위로
    lo.style.zIndex = min >= PRICE_MAX - PRICE_STEP ? '3' : '2';
}

function initPrice() {
    try {
        const saved = JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null');
        if (saved && Number.isFinite(saved.min) && Number.isFinite(saved.max)) state.price = saved;
    } catch { /* 비공개 모드 등 */ }

    const lo = $('price-min');
    const hi = $('price-max');
    const onInput = (which) => {
        let min = Number(lo.value);
        let max = Number(hi.value);
        // 캡끼리 넘어가지 않게: 최소 한 칸 간격
        if (which === 'min' && min > max - PRICE_STEP) min = max - PRICE_STEP;
        if (which === 'max' && max < min + PRICE_STEP) max = min + PRICE_STEP;
        state.price = { min: Math.max(0, min), max: Math.min(PRICE_MAX, max) };
        renderPrice();
        try { localStorage.setItem(PRICE_KEY, JSON.stringify(state.price)); } catch { /* 무시 */ }
    };
    lo.addEventListener('input', () => onInput('min'));
    hi.addEventListener('input', () => onInput('max'));
    renderPrice();
}

/* ---------- CRT 효과 ---------- */

const CRT_KEY = 'lunch-roulette:crt';

function setCrt(on, save = true) {
    $('map-screen').classList.toggle('is-crt', on);
    $('crt-toggle').setAttribute('aria-pressed', String(on));
    if (save) {
        try { localStorage.setItem(CRT_KEY, on ? 'on' : 'off'); } catch { /* 저장 못 해도 화면은 바뀜 */ }
    }
}

function initCrt() {
    let saved = null;
    try { saved = localStorage.getItem(CRT_KEY); } catch { /* 비공개 모드 등 */ }
    setCrt(saved !== 'off', false);
    $('crt-toggle').addEventListener('click', () => {
        setCrt($('crt-toggle').getAttribute('aria-pressed') !== 'true');
    });
}

/* ---------- 카세트 A면 / B면 ---------- */

function selectTab(tab) {
    el.tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
    });
}

el.tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = el.tabs[(i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length];
        selectTab(next);
        next.focus();
    });
});

/* ---------- 이벤트 ---------- */

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
el.locForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // 목록에서 고른 줄이 있으면 그걸 확정, 아니면 새로 검색
    if (!el.locPop.hidden && locActive >= 0 && locItems[locActive]) {
        pickLocation(locItems[locActive]);
        return;
    }
    searchLocation(el.locInput.value.trim());
});
el.locInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideLocResults(); return; }
    if (el.locPop.hidden || !locItems.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setLocActive(locActive + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setLocActive(locActive < 0 ? -1 : locActive - 1); }
});
el.locInput.addEventListener('input', () => {
    // 글자를 바꾸면 고른 줄은 해제 (Enter = 새 검색)
    if (locActive >= 0) {
        locActive = -1;
        el.locResults.querySelectorAll('[aria-selected="true"]').forEach((r) => r.setAttribute('aria-selected', 'false'));
        el.locInput.removeAttribute('aria-activedescendant');
    }
});
el.locClose.addEventListener('click', () => { hideLocResults(); el.locInput.focus(); });
document.addEventListener('click', (e) => {
    if (!el.locPop.hidden && !e.target.closest('.rl-locate')) hideLocResults();
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
el.resultAgain.addEventListener('click', () => {
    if (!state.winner) return;
    markLastResult('재실행');
    renderLog();
    spin();
});
el.typeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const type = button.dataset.type;
        if (!type) state.types.clear();               // 전체
        else if (state.types.has(type)) state.types.delete(type);
        else state.types.add(type);

        el.typeButtons.forEach((b) => {
            const on = b.dataset.type ? state.types.has(b.dataset.type) : state.types.size === 0;
            b.setAttribute('aria-pressed', String(on));
        });
        if (state.center) fetchPlaces();
    });
});
el.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchMenu(el.searchInput.value.trim());
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

hydrateIcons();
terminalInput(el.locInput);
terminalInput(el.searchInput);
initSlots();
initPrice();
initCrt();
setTicketIdle();
renderLog();
initMap();
// 직접 고른 위치가 있으면 거기서 시작 (PC는 기기 위치가 부정확한 경우가 많음). 없으면 바로 현재 위치를 물음
const saved = savedPlace();
if (saved) applyCenter(saved.lat, saved.lng, { label: saved.label });
else locate();
