/**
 * 점심 룰렛: 현재 위치 → 반경 안 식당 → 돌림판.
 * 식당 데이터는 서버(/restaurants)가 카카오 로컬 API로 조회한다. REST 키는 브라우저에 노출하지 않는다.
 */

const WHEEL_SLOTS = 8; // 돌림판에 올리는 후보 수
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 위치를 못 받을 때: 서울시청
const SPIN_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 4500;
const SLICE_COLORS = ['#fde68a', '#fecaca', '#bbf7d0', '#bfdbfe', '#fed7aa', '#e9d5ff', '#a5f3fc', '#fbcfe8'];

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
};

const state = {
    center: null,
    radius: 500,
    pool: [],            // 반경 안 전체 식당
    excluded: new Set(), // 사용자가 뺀 식당 id
    candidates: [],      // 돌림판에 올라간 식당
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

        locate();
    });
}

function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
        setStatus('이 주소에서는 위치를 받을 수 없어요. 지도를 눌러 위치를 정해 주세요.');
        return;
    }

    setStatus('현재 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition(
        (pos) => setCenter(pos.coords.latitude, pos.coords.longitude),
        () => setStatus('위치 권한이 없어요. 지도를 눌러 위치를 정해 주세요.'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
}

function setCenter(lat, lng) {
    state.center = { lat, lng };
    const pos = new kakao.maps.LatLng(lat, lng);

    centerOverlay?.setMap(null);
    centerOverlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb55"></div>',
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
        strokeColor: '#2563eb',
        strokeOpacity: 0.6,
        fillColor: '#2563eb',
        fillOpacity: 0.06,
    });
    radiusCircle.setMap(map);
    map.setLevel(state.radius >= 1000 ? 6 : state.radius >= 500 ? 5 : 4);
}

function drawMarkers() {
    placeMarkers.forEach((m) => m.setMap(null));
    placeMarkers = state.pool
        .filter((p) => !state.excluded.has(p.id))
        .map((p) => new kakao.maps.Marker({
            position: new kakao.maps.LatLng(p.lat, p.lng),
            title: p.name,
            map,
        }));
}

function highlightWinner(place) {
    winnerOverlay?.setMap(null);
    const label = document.createElement('div');
    label.textContent = `🍽️ ${place.name}`;
    label.style.cssText = 'padding:6px 10px;border-radius:999px;background:#18181b;color:#fff;font:600 13px/1 sans-serif;white-space:nowrap;transform:translateY(-52px)';

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
    url.search = new URLSearchParams({ lat: state.center.lat.toFixed(6), lng: state.center.lng.toFixed(6), radius: state.radius });

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

        const label = state.radius >= 1000 ? `${state.radius / 1000}km` : `${state.radius}m`;
        setStatus(state.pool.length ? `반경 ${label} 안 식당 ${state.pool.length}곳` : `반경 ${label} 안에 식당이 없어요. 반경을 넓혀 보세요.`);
    } catch (e) {
        if (requestId !== state.requestId) return;
        state.pool = [];
        pickCandidates();
        setStatus(e.message);
    } finally {
        if (requestId === state.requestId) setBusy(false);
    }
}

function available() {
    return state.pool.filter((p) => !state.excluded.has(p.id));
}

function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickCandidates() {
    state.candidates = shuffle(available()).slice(0, WHEEL_SLOTS);
    render();
}

function exclude(id) {
    state.excluded.add(id);
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
        c.setAttribute('r', '96');
        c.setAttribute('class', 'fill-zinc-100 stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700');
        el.rotor.append(c);
        return;
    }

    const slice = 360 / n;
    state.candidates.forEach((place, i) => {
        const g = document.createElementNS(SVG_NS, 'g');
        const shape = document.createElementNS(SVG_NS, n === 1 ? 'circle' : 'path');

        if (n === 1) {
            shape.setAttribute('r', '96');
        } else {
            const [x1, y1] = point(i * slice, 96);
            const [x2, y2] = point((i + 1) * slice, 96);
            shape.setAttribute('d', `M0 0 L${x1} ${y1} A96 96 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2} Z`);
        }
        shape.setAttribute('fill', SLICE_COLORS[i % SLICE_COLORS.length]);
        shape.setAttribute('stroke', '#fff');
        shape.setAttribute('stroke-width', '1.5');

        // 이름은 조각 가운데 방향으로. 왼쪽 절반은 뒤집어서 거꾸로 보이지 않게
        const mid = (i + 0.5) * slice;
        const flip = mid > 180;
        const text = document.createElementNS(SVG_NS, 'text');
        text.textContent = place.name.length > 8 ? `${place.name.slice(0, 7)}…` : place.name;
        text.setAttribute('x', flip ? '-88' : '88');
        text.setAttribute('y', '0');
        text.setAttribute('text-anchor', flip ? 'start' : 'end');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', n > 6 ? '9' : '11');
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', '#1c1917');
        text.setAttribute('transform', `rotate(${flip ? mid + 90 : mid - 90})`);

        g.append(shape, text);
        el.rotor.append(g);
    });
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
    el.resultMeta.textContent = [place.category, `${place.distance}m`, place.phone].filter(Boolean).join(' · ');
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
    const rest = available().length;
    el.count.textContent = state.pool.length ? `${state.candidates.length} / ${rest}곳` : '';

    if (!state.candidates.length) {
        const li = document.createElement('li');
        li.className = 'px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400';
        li.textContent = state.pool.length ? '남은 후보가 없어요. 반경을 넓혀 보세요.' : '위치를 정하면 근처 식당이 여기 올라와요.';
        el.candidates.replaceChildren(li);
        return;
    }

    el.candidates.replaceChildren(...state.candidates.map((place, i) => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-3 px-4 py-2.5';

        const dot = document.createElement('span');
        dot.className = 'size-3 shrink-0 rounded-full';
        dot.style.background = SLICE_COLORS[i % SLICE_COLORS.length];

        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const name = document.createElement('p');
        name.className = 'truncate text-sm font-medium';
        name.textContent = place.name;
        const meta = document.createElement('p');
        meta.className = 'truncate text-xs text-zinc-500 dark:text-zinc-400';
        meta.textContent = `${place.category} · ${place.distance}m`;
        info.append(name, meta);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white';
        remove.textContent = '빼기';
        remove.disabled = state.spinning;
        remove.setAttribute('aria-label', `${place.name} 후보에서 빼기`);
        remove.addEventListener('click', () => exclude(place.id));

        li.append(dot, info, remove);
        return li;
    }));
}

function render() {
    renderWheel();
    renderCandidates();
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
initMap();
