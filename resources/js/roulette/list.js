/** SIDE A 후보 목록 (돌림판 칸과 같은 번호·색) */
import { SHUT_TONE, SLICES } from './constants.js';
import { el } from './dom.js';
import { blocked, hoursTag } from './hours.js';
import { exclude } from './places.js';
import { detailLink, iconKey, metaLine, well } from './rows.js';
import { state } from './state.js';

export function renderCandidates() {
    el.count.textContent = `${state.candidates.length}/${state.slots}`;

    if (!state.candidates.length) {
        const li = document.createElement('li');
        li.className = 'rl-track__empty';
        li.textContent = state.center ? 'EMPTY — 자동 채움 또는 SIDE B 메뉴 검색' : 'NO LOC — 01 LOC 위치 설정 필요';
        el.candidates.replaceChildren(li);
        return;
    }

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
        meta.prepend(hoursTag(place));
        info.append(name, meta);

        const remove = iconKey('button', 'close', `${place.name} 후보에서 제외`, '제외');
        remove.disabled = state.spinning;
        remove.addEventListener('click', () => exclude(place.id));

        li.append(no, info, well(detailLink(place), remove));
        return li;
    }));
}
