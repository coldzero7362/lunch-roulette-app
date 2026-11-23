/** 상태가 바뀌면 화면 전체를 다시 맞춤 + 키 잠금 */
import { SLOTS_MAX, SLOTS_MIN } from './constants.js';
import { el } from './dom.js';
import { queueHours } from './hours.js';
import { renderCandidates } from './list.js';
import { renderSearchResults } from './menu-search.js';
import { spare } from './places.js';
import { updateReadout } from './readout.js';
import { state } from './state.js';
import { setTicketIdle } from './ticket.js';
import { renderWheel } from './wheel.js';

export function render() {
    queueHours();
    renderWheel();
    renderCandidates();
    if (state.searchResults.length) renderSearchResults();
    setBusy(state.spinning);
    updateReadout();
    if (!state.winner) setTicketIdle(); // 대기 문구를 후보 상태에 맞춤
}

/** 조회·돌리기 중엔 키를 잠그고, 지금 상태로 못 쓰는 키도 잠금 */
export function setBusy(busy) {
    busy = busy || state.checking || state.spinning;
    const empty = state.candidates.length === 0;
    const autoOnWheel = state.candidates.some((p) => !state.pinned.has(p.id));
    const hasSpare = spare().length > 0;
    el.spin.disabled = busy || (empty && !hasSpare); // 비어 있으면 SPIN 이 자동으로 채움
    el.auto.disabled = busy || state.candidates.length >= state.slots || !hasSpare;
    el.shuffle.disabled = busy || state.candidates.length < 2 && !(autoOnWheel && hasSpare);
    el.clear.disabled = busy || empty;
    el.slotsDown.disabled = busy || state.slots <= SLOTS_MIN;
    el.slotsUp.disabled = busy || state.slots >= SLOTS_MAX;
    el.candidates.querySelectorAll('button').forEach((b) => { b.disabled = busy || (b.dataset.needSpare === '1' && !hasSpare); });
}
