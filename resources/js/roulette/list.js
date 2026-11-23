/** SIDE A 후보 목록 (돌림판 칸과 같은 번호·색) */
import { SHUT_TONE, SLICES } from './constants.js';
import { el } from './dom.js';
import { blocked, hoursOf, hoursTag } from './hours.js';
import { priceShort, wonLabel } from './logic/format.js';
import { daysAgoLabel } from './logic/recent.js';
import { autoFill, exclude, spare } from './places.js';
import { detailLink, iconKey, metaLine, well } from './rows.js';
import { isFavorite, recentNow, toggleFavorite } from './prefs.js';
import { render } from './render.js';
import { state } from './state.js';
import { openMenuSearch } from './tabs.js';

export function renderCandidates() {
    el.count.textContent = `${state.candidates.length}/${state.slots}`;

    if (!state.candidates.length) {
        el.candidates.replaceChildren(emptyRow());
        return;
    }

    const recent = recentNow();
    el.candidates.replaceChildren(...state.candidates.map((place, i) => {
        const shut = blocked(place);
        const tone = shut ? SHUT_TONE : SLICES[i % SLICES.length];
        const li = document.createElement('li');
        li.className = shut ? 'rl-track rl-track--shut' : 'rl-track';

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
        const meta = metaLine(place, state.pinned.has(place.id));
        const hours = hoursTag(place);
        meta.prepend(hours);
        const price = priceTag(place);
        if (price) hours.after(price);
        if (recent.ids.has(place.id)) {
            const ago = document.createElement('span');
            ago.className = 'rl-tag rl-tag--dim';
            ago.textContent = daysAgoLabel(recent.ids.get(place.id));
            ago.title = '최근에 먹은 곳';
            meta.prepend(ago);
        }
        info.append(name, meta);

        const remove = iconKey('button', 'close', `${place.name} 후보에서 제외`, '제외');
        remove.disabled = state.spinning;
        remove.addEventListener('click', () => exclude(place.id));

        li.append(no, info, well(detailLink(place), starKey(place), remove));
        return li;
    }));
}

/** 빈 목록: 설명 대신 바로 누를 키 (자동으로 채우기 / 메뉴로 찾아 넣기) */
function emptyRow() {
    const li = document.createElement('li');
    li.className = 'rl-track__empty rl-empty';
    if (!state.center) {
        li.textContent = 'NO LOC — 01 LOC 위치 설정 필요';
        return li;
    }

    const msg = document.createElement('p');
    msg.className = 'rl-empty__msg';
    msg.textContent = !state.poolLoaded ? '반경 내 식당 조회 중'
        : spare().length ? '비어 있음 — ▶ SPIN 을 누르면 자동으로 채워 돌림'
        : '반경 내 식당 없음 — 반경·종류 변경';

    const fill = textKey(`자동으로 ${state.slots}곳 채우기`, autoFill);
    fill.dataset.needSpare = '1';
    fill.classList.replace('rl-key--beige', 'rl-key--amber'); // 먼저 누를 키는 노란색
    const search = textKey('메뉴로 찾아 넣기', openMenuSearch);

    li.append(msg, well(fill, search));
    return li;
}

function textKey(label, onClick) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'rl-key rl-key--beige rl-key--small';
    key.textContent = label;
    key.addEventListener('click', onClick);
    return key;
}

/** 가격대 배지: 메뉴 최저가부터 ('9천~'). 메뉴판이 없으면 없음 */
function priceTag(place) {
    const price = hoursOf(place)?.price;
    if (!price) return null;
    const tag = document.createElement('span');
    tag.className = 'rl-tag rl-tag--price';
    tag.textContent = `${priceShort(price.min)}~`;
    tag.title = `메뉴 ${wonLabel(price.min)} ~ ${wonLabel(price.max)}`;
    return tag;
}

/** 단골 별 키: 켜면 노란색, 자동 채움에서 3배로 잘 뽑힘 */
export function starKey(place) {
    const on = isFavorite(place.id);
    const key = iconKey('button', 'star', `${place.name} 단골 ${on ? '해제' : '등록'}`, on ? '단골 해제' : '단골 등록 (자동 채움 확률 3배)');
    key.setAttribute('aria-pressed', String(on));
    if (on) key.classList.replace('rl-key--beige', 'rl-key--amber');
    key.addEventListener('click', () => {
        toggleFavorite(place);
        render();
    });
    return key;
}
