/**
 * 상단 계기판: LCD 칸(LOC / RANGE / TYPE / FOUND / WHEEL), 상태 줄, 표시등, 단계 표시등.
 */
import { $, el } from './dom.js';
import { coordText, pad, stepStates, typeLabel, unit } from './logic/format.js';
import { state } from './state.js';

export function setStatus(message) {
    el.status.textContent = message;
}

/** 표시등 상태: on / busy(깜빡임) / off */
export function setLamp(name, lampState) {
    $(`lamp-${name}`).dataset.state = lampState;
}

export function updateReadout() {
    el.fields.loc.textContent = state.place?.label ?? (state.center ? '좌표 지정' : '—');
    el.fields.coord.textContent = coordText(state.center);
    // 계기판식 고정 자릿수: 0500 M / 238 EA / 08/08
    segments(el.fields.range, [pad(state.radius, 4), unit('M')]);
    renderTypeAnnunciators();
    segments(el.fields.found, [state.poolLoaded ? pad(state.pool.length, 3) : { seg: '---' }, unit('EA')]);
    segments(el.fields.wheel, [pad(state.candidates.length, 2), '/', pad(state.slots, 2)]);
    setLamp('gps', state.locating ? 'busy' : state.center ? 'on' : 'off');
    updateSteps();
}

/**
 * TYPE 칸: LCD 고정 표시자. 종류 첫 글자(한 중 일 양 분 주)를 늘 희미하게 새겨 두고 고른 것만 켬.
 * 아무것도 안 고르면(전체) 모두 켬. 여러 개 골라도 칸 폭이 그대로
 */
function renderTypeAnnunciators() {
    const all = el.typeButtons.map((b) => b.dataset.type).filter(Boolean);
    const target = el.fields.type;
    if (!target.childElementCount) {
        target.classList.add('rl-annun');
        target.replaceChildren(...all.map((type) => {
            const mark = document.createElement('span');
            mark.className = 'rl-annun__mark';
            mark.dataset.annun = type; // data-type 은 종류 키가 씀
            mark.textContent = typeLabel(type).slice(0, 1);
            mark.setAttribute('aria-hidden', 'true');
            return mark;
        }));
    }
    target.querySelectorAll('.rl-annun__mark').forEach((mark) => {
        mark.classList.toggle('is-on', !state.types.size || state.types.has(mark.dataset.annun));
    });
    target.setAttribute('aria-label', state.types.size ? [...state.types].map(typeLabel).join(', ') : '전체');
}

/** 단계 표시등: 끝난 단계 녹색, 다음 할 단계 앰버 */
export function updateSteps() {
    const states = stepStates({
        loc: !!state.center,
        cond: state.poolLoaded,
        cand: state.candidates.length >= 2,
        spin: !!state.winner,
    });
    el.steps.forEach((li) => { li.dataset.state = states[li.dataset.step]; });
}

/**
 * LCD 칸 채우기. {seg:'0500'} → 7세그먼트 숫자 (뒤에 꺼진 세그먼트 '8888' 잔상), {unit:'M'} → 작은 단위, 문자열 → 그대로.
 * '-' 는 7세그먼트의 가운데 획으로 그려짐
 */
function segments(target, parts) {
    const line = document.createElement('span');
    line.className = 'rl-lcd__line';
    target.replaceChildren(line);
    line.append(...parts.map((part) => {
        const span = document.createElement('span');
        if (part.seg !== undefined) {
            span.className = 'rl-seg';
            span.textContent = part.seg;
            span.dataset.ghost = '8'.repeat(part.seg.length);
        } else if (part.unit !== undefined) {
            span.className = 'rl-unit';
            span.textContent = part.unit;
        } else {
            span.textContent = String(part);
        }
        return span;
    }));
}
