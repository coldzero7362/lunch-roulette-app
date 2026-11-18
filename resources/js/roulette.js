/**
 * 점심 룰렛: 현재 위치 → 반경 안 식당 → 돌림판.
 * 식당 데이터는 서버(/restaurants)가 카카오 로컬 API로 조회한다. REST 키는 브라우저에 노출하지 않는다.
 */

const WHEEL_SLOTS = 8; // 돌림판에 올리는 후보 수
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 위치를 못 받을 때: 서울시청
const SPIN_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 4500;
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
    rotor: $('wheel-rotor'),
    candidates: $('candidates'),
    count: $('candidate-count'),
    result: $('result'),
    resultName: $('result-name'),
    resultMeta: $('result-meta'),
    resultAddress: $('result-address'),
    resultLink: $('result-link'),
    resultExclude: $('result-exclude'),
    radiusButtons: [...document.querySelectorAll('[data-radius]')],
    typeButtons: [...document.querySelectorAll('[data-type]')],
    searchForm: $('search-form'),
    searchInput: $('search-input'),
    searchStatus: $('search-status'),
    searchResults: $('search-results'),
};

const state = {
    center: null,
    radius: 500,
    pool: [],            // 반경 안 전체 식당
    excluded: new Set(), // 사용자가 뺀 식당 id
    candidates: [],      // 돌림판에 올라간 식당
    types: new Set(),    // 고른 종류 (비면 전체)
    pinned: new Map(),   // 메뉴 찾기로 직접 넣은 식당 (id → place). 섞어도 빠지지 않음
    searchResults: [],
    rotation: 0,
    spinning: false,
    winner: null,
    requestId: 0,
};

let map, centerOverlay, radiusCircle, winnerOverlay;
let placeMarkers = [];

/* ---------- 지도 ---------- */

function initMap() {
    if (!window.kakao?.maps) {
        setStatus('지도를 불러오지 못했어요. 새로고침해 주세요.');
        return;
    }

    kakao.maps.load(() => {
        map = new kakao.maps.Map($('map'), {
            center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: 4,
        });

        kakao.maps.event.addListener(map, 'click', (e) => {
            setCenter(e.latLng.getLat(), e.latLng.getLng());
        });

        if (pendingCenter) {
            setCenter(pendingCenter.lat, pendingCenter.lng);
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
        setStatus('이 주소에서는 위치를 받을 수 없어요. 지도를 눌러 위치를 정해 주세요');
        return;
    }
    if (locating) return;

    locating = true;
    el.locate.disabled = true;
    setStatus('현재 위치를 확인하는 중이에요');

    try {
        let pos;
        try {
            pos = await getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
        } catch (e) {
            if (e.code === 1) throw e; // 권한 거부는 다시 물어도 같다
            setStatus('정확한 위치를 못 찾아서 대략적인 위치로 다시 찾는 중이에요');
            pos = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        }
        applyCenter(pos.coords.latitude, pos.coords.longitude);
    } catch (e) {
        setStatus(locateErrorMessage(e));
    } finally {
        locating = false;
        el.locate.disabled = false;
    }
}

function locateErrorMessage(e) {
    switch (e?.code) {
        case 1: return '위치 권한이 꺼져 있어요. 주소창의 자물쇠 아이콘에서 위치를 허용하거나 지도를 눌러 주세요';
        case 2: return '기기에서 위치를 찾지 못했어요. 위치 서비스를 켜거나 지도를 눌러 위치를 정해 주세요';
        case 3: return '위치를 확인하는 데 시간이 너무 걸려요. 다시 누르거나 지도를 눌러 주세요';
        default: return '현재 위치를 받지 못했어요. 지도를 눌러 위치를 정해 주세요';
    }
}

function applyCenter(lat, lng) {
    if (!map) {
        pendingCenter = { lat, lng };
        return;
    }
    setCenter(lat, lng);
}

function setCenter(lat, lng) {
    state.center = { lat, lng };
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
    map.setLevel(state.radius >= 1000 ? 6 : state.radius >= 500 ? 5 : 4);
}

function drawMarkers() {
    placeMarkers.forEach((m) => m.setMap(null));
    const shown = new Map(state.pool.map((p) => [p.id, p]));
    state.pinned.forEach((p, id) => shown.set(id, p));
    placeMarkers = [...shown.values()]
        .filter((p) => !state.excluded.has(p.id))
        .map((p) => new kakao.maps.Marker({
            position: new kakao.maps.LatLng(p.lat, p.lng),
            title: p.name,
            image: markerImage(),
            map,
        }));
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
    const label = document.createElement('div');
    label.textContent = `▶ ${place.name}`;
    label.style.cssText = "padding:7px 10px;border:2px solid #3f382f;border-radius:4px;background:#0e120f;color:#ffb23f;text-shadow:0 0 6px rgb(255 178 63 / .6);font:14px/1 'Mulmaru',monospace;letter-spacing:.04em;white-space:nowrap;transform:translateY(-54px);box-shadow:0 0 0 1.5px #2b2620";

    const pos = new kakao.maps.LatLng(place.lat, place.lng);
    winnerOverlay = new kakao.maps.CustomOverlay({ position: pos, content: label, zIndex: 5 });
    winnerOverlay.setMap(map);
    map.panTo(pos);
}

/* ---------- 데이터 ---------- */

async function fetchPlaces() {
    if (!state.center) return;

    const requestId = ++state.requestId;
    setStatus('근처 식당을 찾는 중…');
    setBusy(true);

    const url = new URL(root.dataset.restaurantsUrl);
    url.search = areaParams();
    state.types.forEach((t) => url.searchParams.append('types[]', t));

    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (requestId !== state.requestId) return; // 더 최신 요청이 있음

        if (!res.ok) {
            const msg = res.status === 422 ? '국내 위치에서만 검색할 수 있어요.'
                : res.status === 429 ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
                : body.message ?? '식당 정보를 불러오지 못했어요.';
            throw new Error(msg);
        }

        state.pool = body.places ?? [];
        clearResult();
        drawMarkers();
        pickCandidates();

        const label = radiusLabel();
        const kinds = state.types.size ? [...state.types].map(typeLabel).join('·') : '식당';
        setStatus(state.pool.length ? `반경 ${label} 안 ${kinds} ${state.pool.length}곳` : `반경 ${label} 안에 ${kinds}이 없어요. 반경을 넓혀 보세요`);
    } catch (e) {
        if (requestId !== state.requestId) return;
        state.pool = [];
        pickCandidates();
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

/** 직접 넣은 식당은 그대로 두고, 남은 칸을 반경 안 식당으로 무작위 채움 */
function pickCandidates() {
    const pins = [...state.pinned.values()];
    const rest = shuffle(available()).slice(0, Math.max(0, WHEEL_SLOTS - pins.length));
    state.candidates = shuffle([...pins, ...rest]);
    render();
}

function exclude(id) {
    state.excluded.add(id);
    state.pinned.delete(id);
    const index = state.candidates.findIndex((p) => p.id === id);
    if (index !== -1) {
        // 빈자리는 아직 안 올라간 식당으로 채움
        const onWheel = new Set(state.candidates.map((p) => p.id));
        const replacement = shuffle(available().filter((p) => !onWheel.has(p.id)))[0];
        if (replacement) state.candidates.splice(index, 1, replacement);
        else state.candidates.splice(index, 1);
    }
    drawMarkers();
    render();
}

/** 메뉴 찾기 결과를 후보(돌림판)에 넣는다. 자리가 없으면 무작위로 올라간 후보 하나와 바꾼다 */
function addCandidate(place) {
    if (state.spinning) return;
    if (state.candidates.some((p) => p.id === place.id)) return;

    state.excluded.delete(place.id);

    if (state.candidates.length < WHEEL_SLOTS) {
        state.candidates.push(place);
    } else {
        const swappable = state.candidates
            .map((p, i) => [p, i])
            .filter(([p]) => !state.pinned.has(p.id));
        if (!swappable.length) {
            setSearchStatus('후보가 가득 찼어요. 빼기로 자리를 비워 주세요');
            return;
        }
        const [, index] = swappable[Math.floor(Math.random() * swappable.length)];
        state.candidates.splice(index, 1, place);
    }

    state.pinned.set(place.id, place);
    clearResult();
    drawMarkers();
    render();
    setSearchStatus(`${place.name}을(를) 후보에 넣었어요`);
}

/* ---------- 메뉴 찾기 ---------- */

async function searchMenu(query) {
    if (!query) return;
    if (!state.center) {
        setSearchStatus('먼저 위치를 정해 주세요');
        return;
    }

    setSearchStatus(`'${query}' 찾는 중이에요`);
    el.searchResults.replaceChildren();

    const url = new URL(root.dataset.searchUrl);
    url.search = areaParams();
    url.searchParams.set('q', query);

    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(res.status === 429 ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요' : body.message ?? '찾지 못했어요. 다시 시도해 주세요');
        }
        state.searchResults = body.places ?? [];
        setSearchStatus(state.searchResults.length
            ? `반경 ${radiusLabel()} 안 '${query}' ${state.searchResults.length}곳`
            : `반경 ${radiusLabel()} 안에 '${query}' 파는 곳이 없어요. 반경을 넓혀 보세요`);
        renderSearchResults();
    } catch (e) {
        state.searchResults = [];
        setSearchStatus(e.message);
    }
}

function renderSearchResults() {
    const onWheel = new Set(state.candidates.map((p) => p.id));
    el.searchResults.replaceChildren(...state.searchResults.map((place) => {
        const li = document.createElement('li');
        li.className = 'rl-track';

        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const name = document.createElement('p');
        name.className = 'rl-track__name truncate';
        name.textContent = place.name;
        info.append(name, metaLine(place, false));

        const add = document.createElement('button');
        add.type = 'button';
        const added = onWheel.has(place.id);
        add.className = added ? 'rl-key rl-key--beige rl-key--small' : 'rl-key rl-key--small';
        add.textContent = added ? '들어감' : '넣기';
        add.disabled = added || state.spinning;
        add.setAttribute('aria-label', added ? `${place.name} 이미 후보에 있음` : `${place.name} 후보에 넣기`);
        add.addEventListener('click', () => addCandidate(place));

        li.append(info, add);
        return li;
    }));
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
        pin.textContent = '직접';
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

        // 이름은 조각 가운데 방향으로. 왼쪽 절반은 뒤집어서 거꾸로 보이지 않게
        const mid = (i + 0.5) * slice;
        const flip = mid > 180;
        const text = document.createElementNS(SVG_NS, 'text');
        // 가운데 릴 허브에 닿지 않게 7자까지
        text.textContent = place.name.length > 7 ? `${place.name.slice(0, 6)}…` : place.name;
        text.setAttribute('x', flip ? '-88' : '88');
        text.setAttribute('y', '0');
        text.setAttribute('text-anchor', flip ? 'start' : 'end');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', n > 6 ? '10' : '12');
        text.setAttribute('font-family', "'Mulmaru', monospace");
        text.setAttribute('fill', tone.ink);
        text.setAttribute('transform', `rotate(${flip ? mid + 90 : mid - 90})`);

        g.append(shape, text);
        el.rotor.append(g);
    });

    el.rotor.append(reelHub());
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
        showResult(state.candidates[index]);
    }, SPIN_MS + 50);
}

/* ---------- 화면 ---------- */

function showResult(place) {
    state.winner = place;
    el.resultName.textContent = place.name;
    el.resultMeta.textContent = [typeLabel(place.type), place.category !== place.type ? place.category : '', `${place.distance}m`, place.phone].filter(Boolean).join('  ·  ');
    el.resultAddress.textContent = place.address;
    el.resultLink.href = place.url || `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
    el.result.hidden = false;
    highlightWinner(place);
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearResult() {
    state.winner = null;
    el.result.hidden = true;
    winnerOverlay?.setMap(null);
}

function renderCandidates() {
    const total = available().length + state.pinned.size;
    el.count.textContent = total ? `${state.candidates.length}/${total}` : '';

    if (!state.candidates.length) {
        const li = document.createElement('li');
        li.className = 'rl-track__empty';
        li.textContent = state.pool.length ? '남은 후보가 없어요. 반경을 넓혀 보세요' : '위치를 정하면 근처 식당이 여기 올라와요';
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
        no.textContent = `A${i + 1}`;
        no.style.background = tone.fill;
        no.style.color = tone.ink;

        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const name = document.createElement('p');
        name.className = 'rl-track__name truncate';
        name.textContent = place.name;
        info.append(name, metaLine(place, state.pinned.has(place.id)));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'rl-key rl-key--beige rl-key--small';
        remove.textContent = '빼기';
        remove.disabled = state.spinning;
        remove.setAttribute('aria-label', `${place.name} 후보에서 빼기`);
        remove.addEventListener('click', () => exclude(place.id));

        li.append(no, info, remove);
        return li;
    }));
}

function render() {
    renderWheel();
    renderCandidates();
    if (state.searchResults.length) renderSearchResults();
    setBusy(state.spinning);
}

function setBusy(busy) {
    const empty = state.candidates.length === 0;
    el.spin.disabled = busy || empty;
    el.shuffle.disabled = busy || available().length <= state.candidates.length;
    el.candidates.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
}

function setStatus(message) {
    el.status.textContent = message;
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

/* ---------- 이벤트 ---------- */

el.spin.addEventListener('click', spin);
el.shuffle.addEventListener('click', () => { clearResult(); pickCandidates(); });
el.locate.addEventListener('click', locate);
el.resultExclude.addEventListener('click', () => {
    if (!state.winner) return;
    const id = state.winner.id;
    clearResult();
    exclude(id);
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

render();
initCrt();
initMap();
locate(); // 페이지를 열자마자 위치 권한을 묻고 현재 위치로
