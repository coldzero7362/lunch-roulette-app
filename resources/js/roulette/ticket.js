/**
 * 결과 프린터: 영수증(당첨 가게)과 오늘 기록(LOG).
 */
import { LOG_ROWS } from './constants.js';
import { el, REDUCED_MOTION } from './dom.js';
import { ensureHours, hoursOf } from './hours.js';
import { hhmm, logKey, typeLabel, walkMinutes, wonLabel } from './logic/format.js';
import { hoursText } from './logic/hours.js';
import { punchColumns, punchDigits } from './logic/punch.js';
import { clearWinnerMarker, highlightWinner, restoreView } from './map.js';
import { setStatus, updateSteps } from './readout.js';
import { addHistory, dropLastHistory } from './prefs.js';
import { placeUrl } from './rows.js';
import { renderSaved } from './saved.js';
import { state } from './state.js';

export function showResult(place) {
    state.winner = place;
    const log = readLog();
    log.unshift({ t: hhmm(new Date()), name: place.name, act: '당첨' });
    writeLog(log);
    addHistory(place); // 최근 먹은 곳 (재실행·제외하면 지움)
    renderSaved();

    el.resultTime.textContent = `LR-01 · ${hhmm(new Date())}`;
    el.resultNo.textContent = `NO.${String(log.filter((e) => e.act !== '-').length).padStart(2, '0')}`;
    el.result.classList.remove('is-idle');
    el.resultKicker.textContent = 'RESULT';
    el.resultName.textContent = place.name;
    el.resultName.title = place.name;
    el.resultMeta.textContent = [typeLabel(place.type), place.category !== place.type ? place.category : '', `${place.distance}m`, `도보 약 ${walkMinutes(place.distance)}분`].filter(Boolean).join(' · ');
    el.resultAddress.textContent = [place.address, place.phone].filter(Boolean).join(' · ');
    setTicketHours(place);
    // 당첨 가게는 저장해 둔 시간표가 있어도 새로 확인 (임시 휴무 같은 당일 변경)
    ensureHours([place], { force: true }).then(() => {
        if (state.winner?.id === place.id) setTicketHours(place);
    });
    renderPunch(place);
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

const PUNCH_COLUMNS = 28;

/**
 * 천공 카드 느낌만: 영수증 맨 아래 작은 직사각형 구멍 두 줄.
 * 당첨 정보 숫자로 자리를 정함 (윗줄 = 5 이상, 아랫줄 = 홀수) → 영수증마다 무늬가 조금씩 다름
 */
function renderPunch(place) {
    const holes = punchColumns(punchDigits(place), PUNCH_COLUMNS);
    const row = (test) => {
        const line = document.createElement('span');
        line.className = 'rl-punch__row';
        line.append(...holes.map((d) => {
            const hole = document.createElement('span');
            hole.className = d !== null && test(d) ? 'rl-punch__hole is-on' : 'rl-punch__hole';
            return hole;
        }));
        return line;
    };
    el.resultPunch.replaceChildren(row((d) => d >= 5), row((d) => d % 2 === 1));
}

/** 영수증의 영업 줄(늘 '지금' 기준)과 대표 메뉴 줄. 아직 모르면 받아 와서 채움 */
function setTicketHours(place) {
    const h = hoursOf(place, new Date());
    if (h) {
        el.resultHours.textContent = h.status === 'unknown' ? '영업시간 정보 없음' : hoursText(h);
        el.resultHours.dataset.status = h.status;
        const menus = h.menus ?? [];
        el.resultMenu.hidden = !menus.length;
        el.resultMenu.textContent = menus.length ? `대표 메뉴 · ${menus.map((m) => `${m.name} ${wonLabel(m.price)}`).join(' · ')}` : '';
        return;
    }
    el.resultHours.textContent = '영업 상태 확인 중';
    el.resultHours.dataset.status = 'wait';
    el.resultMenu.hidden = true;
    ensureHours([place]).then(() => {
        if (state.winner?.id === place.id) setTicketHours(place);
    });
}

/** 티켓 키 켜고 끄기 (링크는 aria-disabled 로) */
function setTicketActions(on) {
    [el.resultRoute, el.resultLink].forEach((a) => {
        if (on) { a.removeAttribute('aria-disabled'); a.removeAttribute('tabindex'); }
        else { a.setAttribute('aria-disabled', 'true'); a.setAttribute('tabindex', '-1'); a.removeAttribute('href'); }
    });
    el.resultExclude.disabled = !on;
    el.resultNever.disabled = !on;
    el.resultAgain.disabled = !on;
}

/** 프린터 칸을 대기 티켓으로 (자리는 그대로 두어 아래가 밀리지 않게) */
export function setTicketIdle() {
    el.result.classList.add('is-idle');
    el.resultTime.textContent = 'LR-01 · --:--';
    el.resultNo.textContent = 'NO.--';
    el.resultKicker.textContent = state.spinning ? 'SPIN' : 'STANDBY';
    el.resultName.textContent = '—';
    el.resultName.removeAttribute('title');
    el.resultMeta.textContent = state.candidates.length >= 1 ? '▶ SPIN 대기' : '▶ SPIN — 후보는 자동으로 채움';
    el.resultAddress.textContent = ' ';
    el.resultHours.textContent = ' ';
    delete el.resultHours.dataset.status;
    setTicketActions(false);
}

export function clearResult() {
    if (state.winner) restoreView(); // 클로즈업 상태였으면 반경 전체로
    state.winner = null;
    setTicketIdle();
    clearWinnerMarker();
}

/* ---------- 오늘 기록 ---------- */

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
export function markLastResult(act) {
    const log = readLog();
    if (log[0]?.act === '당첨') {
        log[0].act = act;
        writeLog(log);
        dropLastHistory(); // 실제로 안 간 것이니 최근 기록에서 뺌
        renderSaved();
    }
}

/** 최근 5건. 빈 줄도 채워서 칸 높이가 늘 같게 */
export function renderLog() {
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
