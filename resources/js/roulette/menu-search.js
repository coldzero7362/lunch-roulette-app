/** SIDE B 메뉴 찾기: 반경 안에서 메뉴·가게 이름으로 찾아 후보에 직접 넣기 */
import { el, root } from './dom.js';
import { radiusLabel } from './logic/format.js';
import { api } from './net.js';
import { addCandidate, areaParams } from './places.js';
import { detailLink, iconKey, metaLine, well } from './rows.js';
import { state } from './state.js';

export function setSearchStatus(message) {
    el.searchStatus.textContent = message;
}

export async function searchMenu(query) {
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
        const res = await api(url);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(res.status === 429 ? '요청 초과 — 60초 후 재시도' : body.message ?? '검색 실패 — 재시도');
        }
        state.searchResults = body.places ?? [];
        setSearchStatus(state.searchResults.length
            ? `'${query}' ${state.searchResults.length}건 · 반경 ${radiusLabel(state.radius)}`
            : `'${query}' 0건 — 반경 확대`);
        renderSearchResults();
    } catch (e) {
        state.searchResults = [];
        setSearchStatus(e.message);
    }
}

/** 메뉴 일부로만 걸린 곳 (서버 등급: menu / pub) */
const isPartial = (place) => place.match === 'menu' || place.match === 'pub';

export function renderSearchResults() {
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

export function initMenuSearch() {
    el.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        searchMenu(el.searchInput.value.trim());
    });
}
