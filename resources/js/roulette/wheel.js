/**
 * 돌림판: 칸(후보) SVG 그리기와 돌리기.
 * 빈 원판은 기계 플래터, 칸이 있으면 눈금 림·리벳·아톰펑크 장식.
 */
import { INK, SHUT_TONE, SLICES } from './constants.js';
import { el, SPIN_MS } from './dom.js';
import { blocked, ensureHours } from './hours.js';
import { renderCandidates } from './list.js';
import { spinRotation } from './logic/format.js';
import { checking } from './places.js';
import { setStatus } from './readout.js';
import { setBusy } from './render.js';
import { state } from './state.js';
import { clearResult, showResult } from './ticket.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RIM_IN = 89; // 칸은 여기까지, 바깥은 눈금 림

/** 0° = 12시 방향, 시계 방향 */
function point(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return [Math.sin(rad) * r, -Math.cos(rad) * r];
}

/** SVG 요소 하나 (속성 객체로) */
function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
}

/** 바깥 눈금 림: 검은 띠 + 5° 눈금(30°마다 길게) */
function rimScale() {
    const g = svg('g');
    g.append(svg('circle', { r: 93.5, fill: 'none', stroke: '#221e19', 'stroke-width': 9 }));
    for (let deg = 0; deg < 360; deg += 5) {
        const long = deg % 30 === 0;
        const [x1, y1] = point(deg, 90.5);
        const [x2, y2] = point(deg, long ? 97 : 94);
        g.append(svg('line', { x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2), stroke: long ? '#e9e3d4' : '#8a8270', 'stroke-width': long ? 1.1 : .7 }));
    }
    g.append(svg('circle', { r: RIM_IN, fill: 'none', stroke: INK, 'stroke-width': 1.4 }));
    return g;
}

/** 칸 경계마다 림에 박힌 리벳 */
function rivets(n) {
    const g = svg('g');
    const count = n > 1 ? n : 6;
    for (let i = 0; i < count; i++) {
        const [x, y] = point((360 / count) * i, 93.5);
        g.append(svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 2, fill: '#aba38f', stroke: '#14110e', 'stroke-width': .7 }));
        g.append(svg('circle', { cx: (x - .5).toFixed(2), cy: (y - .5).toFixed(2), r: .6, fill: 'rgb(255 255 255 / .35)' }));
    }
    return g;
}

/**
 * 아톰펑크 장식 (칸 위, 번호 아래):
 * 타공 링(점선) + 가운데 별빛 방사선 + 원자 궤도 3개와 전자
 */
function atomicCore() {
    const g = svg('g', { 'pointer-events': 'none' });
    // 타공 링: 칸 가운데쯤을 도는 점선 (번호와 허브 사이)
    g.append(svg('circle', { r: 54, fill: 'none', stroke: 'rgb(43 38 32 / .45)', 'stroke-width': 1.6, 'stroke-dasharray': '.1 4.2', 'stroke-linecap': 'round' }));
    // 별빛 방사선: 길고 짧은 살 12개
    for (let k = 0; k < 12; k++) {
        const [x, y] = point(k * 30, k % 2 ? 30 : 42);
        g.append(svg('line', { x1: 0, y1: 0, x2: x.toFixed(2), y2: y.toFixed(2), stroke: 'rgb(43 38 32 / .5)', 'stroke-width': k % 2 ? .8 : 1.2, 'stroke-linecap': 'round' }));
    }
    // 원자 궤도: 60°씩 돌린 타원 3개 + 전자
    [0, 60, 120].forEach((rot, k) => {
        const orbit = svg('g', { transform: `rotate(${rot})` });
        orbit.append(svg('ellipse', { rx: 36, ry: 12, fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
        const t = [0.35, 2.75, 5.9][k]; // 허브에 가리지 않게 궤도 바깥쪽에
        orbit.append(svg('circle', { cx: (36 * Math.cos(t)).toFixed(2), cy: (12 * Math.sin(t)).toFixed(2), r: 2.6, fill: '#e9e3d4', stroke: INK, 'stroke-width': 1 }));
        g.append(orbit);
    });
    g.append(svg('circle', { r: 24, fill: 'none', stroke: INK, 'stroke-width': 1.2 }));
    return g;
}

/** 빈 원판: 기계 플래터. 동심원 홈 + 경량화 구멍 6개 + 볼트 6개 + 원호 각인 */
function emptyPlatter() {
    const g = svg('g');
    g.append(svg('circle', { r: 98, fill: '#37312a' }));
    // 동심원 홈 (가공 자국)
    for (let r = 62; r <= 86; r += 2.4) {
        g.append(svg('circle', { r: r.toFixed(1), fill: 'none', stroke: 'rgb(0 0 0 / .28)', 'stroke-width': .6 }));
        g.append(svg('circle', { r: (r + .8).toFixed(1), fill: 'none', stroke: 'rgb(255 255 255 / .05)', 'stroke-width': .5 }));
    }
    // 경량화 구멍: 뚫린 구멍 안은 어둡고, 위쪽 가장자리에 그늘
    for (let k = 0; k < 6; k++) {
        const [x, y] = point(k * 60 + 30, 43);
        g.append(svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 11.5, fill: '#4a4338' }));
        g.append(svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 10, fill: '#120f0c' }));
        g.append(svg('path', { d: `M${(x - 8.6).toFixed(2)} ${(y - 5).toFixed(2)} A10 10 0 0 1 ${(x + 8.6).toFixed(2)} ${(y - 5).toFixed(2)}`, fill: 'none', stroke: 'rgb(0 0 0 / .6)', 'stroke-width': 2 }));
    }
    // 볼트: 허브 둘레 육각 볼트 6개
    for (let k = 0; k < 6; k++) {
        const [x, y] = point(k * 60, 28);
        const hex = Array.from({ length: 6 }, (_, j) => {
            const [hx, hy] = point(j * 60 + 30, 3.6);
            return `${(hx + x).toFixed(2)},${(hy + y).toFixed(2)}`;
        }).join(' ');
        g.append(svg('polygon', { points: hex, fill: '#8a8270', stroke: '#14110e', 'stroke-width': .8 }));
        g.append(svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 1.3, fill: '#2b2620' }));
    }
    // 원호 각인
    const defs = svg('defs');
    defs.append(svg('path', { id: 'rl-platter-arc', d: 'M -55 0 A 55 55 0 0 1 55 0' }));
    const label = svg('text', { 'font-family': "'Mulmaru Mono', monospace", 'font-size': 6.5, 'letter-spacing': 1.6, fill: '#8a8270', 'text-anchor': 'middle' });
    const path = svg('textPath', { href: '#rl-platter-arc', startOffset: '50%' });
    path.textContent = 'LR-01 ROTOR · NO LOAD';
    label.append(path);
    g.append(defs, label);
    return g;
}

/** 가운데 카세트 릴 허브: 톱니 6개. 돌림판과 같이 돈다 */
function reelHub() {
    const g = svg('g');
    g.append(svg('circle', { r: 19, fill: '#ddd6c4', stroke: INK, 'stroke-width': 3 }));
    g.append(svg('circle', { r: 11, fill: '#1d1a16' }));
    for (let k = 0; k < 6; k++) {
        g.append(svg('rect', { x: -2.2, y: -12, width: 4.4, height: 5, fill: '#ddd6c4', transform: `rotate(${k * 60})` }));
    }
    return g;
}

/** 칸 하나: 한 칸이면 원, 아니면 부채꼴 */
function sliceShape(i, n) {
    if (n === 1) return svg('circle', { r: 98 });
    const slice = 360 / n;
    const [x1, y1] = point(i * slice, 98);
    const [x2, y2] = point((i + 1) * slice, 98);
    return svg('path', { d: `M0 0 L${x1} ${y1} A98 98 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2} Z` });
}

export function renderWheel() {
    const n = state.candidates.length;
    el.rotor.replaceChildren();

    if (n === 0) {
        el.rotor.append(emptyPlatter(), rimScale(), rivets(0), reelHub());
        return;
    }

    const slice = 360 / n;
    const numbers = [];
    state.candidates.forEach((place, i) => {
        // 영업중 필터에 걸린 칸은 꺼진 색 (번호 자리는 그대로: 목록 번호와 맞춤)
        const tone = blocked(place) ? SHUT_TONE : SLICES[i % SLICES.length];
        const shape = sliceShape(i, n);
        shape.setAttribute('fill', tone.fill);
        shape.setAttribute('stroke', INK);
        shape.setAttribute('stroke-width', '1.2');
        el.rotor.append(shape);

        // 조각엔 번호만 (이름은 SIDE A 목록에 같은 번호로). 잘리거나 뒤집혀 읽기 어려운 문제를 없앰
        const [tx, ty] = point((i + 0.5) * slice, n > 8 ? 74 : 70);
        const text = svg('text', {
            x: tx.toFixed(1),
            y: ty.toFixed(1),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': n > 8 ? 14 : n > 4 ? 19 : 23,
            'font-family': "'Mulmaru Mono', monospace",
            fill: tone.ink,
        });
        text.textContent = String(i + 1);
        text.classList.add('rl-wheel__no');
        text.style.transform = `rotate(${-state.rotation}deg)`; // 멈춘 돌림판 기준으로 똑바로
        numbers.push(text);
    });

    // 칸 위 장식 → 번호 → 림·리벳 → 허브
    el.rotor.append(atomicCore(), ...numbers, rimScale(), rivets(n), reelHub());
}

/** 돌림판이 멈추면 칸 번호를 다시 똑바로 세움 (돌아간 채로 두면 6과 9가 헷갈림) */
function uprightNumbers() {
    el.rotor.querySelectorAll('.rl-wheel__no').forEach((t) => {
        t.style.transform = `rotate(${-state.rotation}deg)`;
    });
}

export async function spin() {
    const n = state.candidates.length;
    if (state.spinning || state.checking || n === 0) return;

    if (state.openOnly) {
        setStatus('영업 상태 확인 중');
        await checking(() => ensureHours(state.candidates));
        renderWheel();
        renderCandidates();
    }
    // 영업중 필터가 켜져 있으면 못 가는 칸은 추첨에서 뺌
    const eligible = state.candidates.map((p, i) => i).filter((i) => !blocked(state.candidates[i]));
    if (!eligible.length) {
        setStatus('영업 중 후보 0 — 자동 채움 또는 HOURS 해제');
        return;
    }

    state.spinning = true;
    clearResult();
    setBusy(true);
    setStatus('SPIN');

    const index = eligible[Math.floor(Math.random() * eligible.length)];
    state.rotation = spinRotation(state.rotation, index, n, Math.random() - 0.5);

    el.rotor.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
    el.rotor.style.transform = `rotate(${state.rotation}deg)`;

    setTimeout(() => {
        state.spinning = false;
        setBusy(false);
        uprightNumbers();
        showResult(state.candidates[index]);
    }, SPIN_MS + 50);
}
