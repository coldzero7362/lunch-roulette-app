/**
 * 카세트 C면: 단골 · 최근 먹은 기록 · 다시 안 감 관리.
 * 모두 브라우저(prefs.js)에 저장. 후보 줄 ★, 영수증 [다시 안 감], 당첨 기록이 여기로 모임
 */
import { el } from './dom.js';
import { daysGapLabel } from './logic/recent.js';
import { distanceM } from './logic/geo.js';
import { dateKey } from './logic/schedule.js';
import { drawMarkers } from './map.js';
import { addCandidate } from './places.js';
import { avoidRecent, favoriteList, historyList, isFavorite, neverList, removeHistory, removeNever, setAvoidRecent, setWeatherOn, toggleFavorite, weatherOn } from './prefs.js';
import { ensureWeather, updateLamp, weatherNote } from './weather.js';
import { setStatus } from './readout.js';
import { render } from './render.js';
import { detailLink, iconKey, metaLine, well } from './rows.js';
import { state } from './state.js';

const HISTORY_SHOWN = 14; // 기록은 최근 14건까지 보여 줌 (피하기는 7일치만 씀)

const sepRow = (text) => {
    const li = document.createElement('li');
    li.className = 'rl-search__sep';
    li.textContent = text;
    return li;
};

const noteRow = (text) => {
    const li = document.createElement('li');
    li.className = 'rl-track__empty';
    li.textContent = text;
    return li;
};

/** 단골은 지금 위치에서 거리를 다시 잼 (저장할 땐 거리를 안 남김) */
const withDistance = (p) => ({ ...p, distance: state.center ? Math.round(distanceM(state.center, p)) : 0 });

function starKey(place) {
    const on = isFavorite(place.id);
    const key = iconKey('button', 'star', `${place.name} 단골 ${on ? '해제' : '등록'}`, on ? '단골 해제' : '단골 등록');
    key.setAttribute('aria-pressed', String(on));
    if (on) key.classList.replace('rl-key--beige', 'rl-key--amber');
    key.addEventListener('click', () => { toggleFavorite(place); render(); });
    return key;
}

/** 후보에 이미 있으면 #번호, 없으면 [+] */
function addOrSlot(place) {
    const slot = state.candidates.findIndex((p) => p.id === place.id);
    if (slot !== -1) {
        const on = document.createElement('span');
        on.className = 'rl-track__on';
        on.textContent = `#${slot + 1}`;
        return on;
    }
    const add = iconKey('button', 'plus', `${place.name} 후보 추가`, '후보 추가');
    add.disabled = state.spinning || !state.center;
    add.addEventListener('click', () => addCandidate(withDistance(place)));
    return add;
}

function nameBlock(text, meta) {
    const info = document.createElement('div');
    info.className = 'min-w-0 flex-1';
    const name = document.createElement('p');
    name.className = 'rl-track__name truncate';
    name.textContent = text;
    info.append(name, meta);
    return info;
}

function favoriteRow(place) {
    const li = document.createElement('li');
    li.className = 'rl-track';
    const tail = addOrSlot(place);
    const keys = tail.tagName === 'SPAN' ? [well(detailLink(place), starKey(place)), tail] : [well(detailLink(place), starKey(place), tail)];
    li.append(nameBlock(place.name, metaLine(place, false)), ...keys);
    return li;
}

function historyRow(entry, index, today) {
    const li = document.createElement('li');
    li.className = 'rl-track';
    const meta = document.createElement('p');
    meta.className = 'rl-track__meta truncate';
    const when = document.createElement('span');
    when.className = 'rl-tag rl-tag--dim';
    when.textContent = daysGapLabel(entry.day, today);
    meta.append(when, ` ${entry.category || entry.type || ''}`);
    const drop = iconKey('button', 'close', `${entry.name} 기록 지우기`, '기록 지우기 (안 간 걸로)');
    drop.addEventListener('click', () => { removeHistory(index); render(); });
    li.append(nameBlock(entry.name, meta), well(starKey(entry), drop));
    return li;
}

function neverRow(entry) {
    const li = document.createElement('li');
    li.className = 'rl-track rl-track--partial';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'rl-key rl-key--beige rl-key--small';
    undo.textContent = '해제';
    undo.setAttribute('aria-label', `${entry.name} 다시 안 감 해제`);
    undo.addEventListener('click', () => { removeNever(entry.id); drawMarkers(); render(); });
    const name = document.createElement('p');
    name.className = 'rl-track__name truncate min-w-0 flex-1';
    name.textContent = entry.name;
    li.append(name, well(undo));
    return li;
}

export function renderSaved() {
    const today = dateKey(new Date());
    const favs = favoriteList().map(withDistance).sort((a, b) => a.distance - b.distance);
    const history = historyList().slice(0, HISTORY_SHOWN);
    const nevers = neverList();

    const rows = [sepRow(`★ 단골 ${favs.length}`)];
    if (!favs.length) rows.push(noteRow('후보 줄의 ★ 키로 등록 — 자동 채움에서 3배 잘 뽑힘'));
    rows.push(...favs.map(favoriteRow));

    rows.push(sepRow(`최근 먹은 곳 ${history.length}`));
    if (!history.length) rows.push(noteRow('당첨되면 여기 남음 — 재실행·제외하면 안 남음'));
    rows.push(...history.map((h, i) => historyRow(h, i, today)));

    rows.push(sepRow(`✕ 다시 안 감 ${nevers.length}`));
    if (!nevers.length) rows.push(noteRow('영수증의 [다시 안 감] 키로 등록 — 자동 채움·지도에서 빠짐'));
    rows.push(...nevers.map(neverRow));

    el.saved.replaceChildren(...rows);
    el.avoidToggle.setAttribute('aria-pressed', String(avoidRecent()));
    el.weatherToggle.setAttribute('aria-pressed', String(weatherOn()));
}

export function initSaved() {
    el.weatherToggle.addEventListener('click', async () => {
        setWeatherOn(!weatherOn());
        render();
        updateLamp();
        if (!weatherOn()) { setStatus('날씨 보정: 끔'); return; }
        await ensureWeather();
        setStatus(`날씨 보정: 켬${weatherNote() ? ` — 지금 ${weatherNote()}` : ' (지금은 보정할 날씨 아님)'}`);
    });
    el.avoidToggle.addEventListener('click', () => {
        setAvoidRecent(!avoidRecent());
        render();
        setStatus(avoidRecent() ? '최근 먹은 곳 피하기: 켬 (일주일 안 먹은 곳 제외, 같은 종류 덜 뽑음)' : '최근 먹은 곳 피하기: 끔');
    });
}
