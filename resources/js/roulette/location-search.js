/**
 * 01 LOC 위치 검색: 역·건물·주소로 중심을 정함 (PC 처럼 기기 위치가 부정확할 때).
 * 입력칸 아래 펼침 목록(combobox), 키보드 ↑↓ / Enter / Esc.
 */
import { el, root } from './dom.js';
import { matchRange } from './logic/format.js';
import { choosePlace } from './map.js';
import { api } from './net.js';

let items = []; // 지금 결과 목록
let active = -1; // 키보드로 고른 줄

function showPop(head) {
    el.locHead.textContent = head;
    el.locPop.hidden = false;
    el.locInput.setAttribute('aria-expanded', 'true');
}

function hideResults() {
    el.locPop.hidden = true;
    el.locResults.replaceChildren();
    el.locInput.setAttribute('aria-expanded', 'false');
    el.locInput.removeAttribute('aria-activedescendant');
    items = [];
    active = -1;
}

/** 이름에서 검색어 부분을 <mark> 로 강조 (공백 무시, 대소문자 무시) */
function highlight(text, query) {
    const frag = document.createDocumentFragment();
    const range = matchRange(text, query);
    if (!range) { frag.append(text); return frag; }
    const chars = [...text];
    const [from, to] = range;
    const mark = document.createElement('mark');
    mark.className = 'rl-hit';
    mark.textContent = chars.slice(from, to).join('');
    frag.append(chars.slice(0, from).join(''), mark, chars.slice(to).join(''));
    return frag;
}

function setActive(i) {
    const rows = [...el.locResults.querySelectorAll('.rl-locate__item')];
    if (!rows.length) return;
    active = (i + rows.length) % rows.length;
    rows.forEach((r, k) => r.setAttribute('aria-selected', String(k === active)));
    el.locInput.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView({ block: 'nearest' });
}

function pick(loc) {
    el.locInput.value = loc.name;
    hideResults();
    choosePlace(loc.lat, loc.lng, loc.name);
}

function resultRow(loc, i, query) {
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
    li.addEventListener('click', () => pick(loc));
    li.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
    return li;
}

async function search(query) {
    if (!query) return;

    const note = (head, text) => {
        const li = document.createElement('li');
        li.className = 'rl-locate__note';
        li.textContent = text;
        el.locResults.replaceChildren(li);
        items = [];
        active = -1;
        showPop(head);
    };
    note('SEARCH', `'${query}' 검색 중`);

    const url = new URL(root.dataset.locationsUrl);
    url.searchParams.set('q', query);

    try {
        const res = await api(url);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 429 ? '요청 초과 — 60초 후 재시도' : body.message ?? '위치 조회 실패 — 재시도');

        const locations = body.locations ?? [];
        if (!locations.length) {
            note('RESULT 0건', `'${query}' 0건 — 역·건물명 또는 도로명 주소 입력`);
            return;
        }

        items = locations;
        el.locResults.replaceChildren(...locations.map((loc, i) => resultRow(loc, i, query)));
        showPop(`RESULT ${locations.length}건`);
    } catch (e) {
        note('ERROR', e.message);
    }
}

export function initLocationSearch() {
    el.locForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // 목록에서 고른 줄이 있으면 그걸 확정, 아니면 새로 검색
        if (!el.locPop.hidden && active >= 0 && items[active]) {
            pick(items[active]);
            return;
        }
        search(el.locInput.value.trim());
    });
    el.locInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideResults(); return; }
        if (el.locPop.hidden || !items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active < 0 ? -1 : active - 1); }
    });
    el.locInput.addEventListener('input', () => {
        // 글자를 바꾸면 고른 줄은 해제 (Enter = 새 검색)
        if (active >= 0) {
            active = -1;
            el.locResults.querySelectorAll('[aria-selected="true"]').forEach((r) => r.setAttribute('aria-selected', 'false'));
            el.locInput.removeAttribute('aria-activedescendant');
        }
    });
    el.locClose.addEventListener('click', () => { hideResults(); el.locInput.focus(); });
    document.addEventListener('click', (e) => {
        if (!el.locPop.hidden && !e.target.closest('.rl-locate')) hideResults();
    });
}
