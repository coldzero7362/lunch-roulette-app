/**
 * 영수증 덤: '뭐 시키지?' 메뉴 뽑기, 공유(글 복사), 이미지 저장.
 * 모두 이미 받아 둔 정보만 씀 (추가 조회 없음).
 */
import { el, REDUCED_MOTION } from './dom.js';
import { hoursOf } from './hours.js';
import { wonLabel } from './logic/format.js';
import { hoursText } from './logic/hours.js';
import { setStatus } from './readout.js';
import { placeUrl } from './rows.js';
import { state } from './state.js';

const PRICE_FLOOR = 3000; // 공기밥·음료 같은 곁들이는 뽑기에서 뺌

let choices = [];
let picked = null;
let rolling = 0;

/* ---------- 뭐 시키지? ---------- */

/** 당첨 가게 메뉴로 뽑기 후보를 정함 (곁들이 빼고 2개 이상일 때만 키를 보임) */
export function setMenuChoices(menus) {
    const next = (menus ?? []).filter((m) => m.price >= PRICE_FLOOR);
    const same = next.length === choices.length && next.every((m, i) => m.name === choices[i].name);
    choices = next;
    el.resultPick.hidden = choices.length < 2;
    if (!same) resetMenuPick();
}

export function resetMenuPick() {
    rolling++;
    picked = null;
    el.menuPicked.textContent = '';
    el.menuPicked.classList.remove('is-done');
    el.menuPick.disabled = false;
    el.menuPick.textContent = '뭐 시키지?';
}

const menuText = (m) => `${m.name} ${wonLabel(m.price)}`;

/** 슬롯머신처럼 메뉴 이름을 빠르게 돌리다 점점 느려지며 멈춤 */
function pickMenu() {
    if (choices.length < 2) return;
    const run = ++rolling;
    const final = choices[Math.floor(Math.random() * choices.length)];
    el.menuPicked.classList.remove('is-done');
    el.menuPick.disabled = true;
    const land = () => {
        if (run !== rolling) return;
        picked = final;
        el.menuPicked.textContent = `▶ ${menuText(final)}`;
        el.menuPicked.classList.add('is-done');
        el.menuPick.disabled = false;
        el.menuPick.textContent = '다시 뽑기';
        setStatus(`오늘 메뉴: ${final.name}`);
    };
    if (REDUCED_MOTION) { land(); return; }
    let i = Math.floor(Math.random() * choices.length);
    let delay = 45;
    const tick = () => {
        if (run !== rolling) return;
        if (delay > 260) { land(); return; }
        i = (i + 1) % choices.length;
        el.menuPicked.textContent = `▶ ${menuText(choices[i])}`;
        delay *= 1.16;
        setTimeout(tick, delay);
    };
    tick();
}

/* ---------- 공유 ---------- */

function ticketLines(place) {
    const h = hoursOf(place, new Date());
    const status = h && h.status !== 'unknown' ? hoursText(h) : '';
    return {
        meta: el.resultMeta.textContent,
        status,
        menu: picked ? `오늘 메뉴 · ${menuText(picked)}` : (h?.menus?.length ? `대표 메뉴 · ${h.menus.slice(0, 3).map(menuText).join(' · ')}` : ''),
        address: place.address ?? '',
    };
}

function shareBody(place) {
    const t = ticketLines(place);
    return [`🍚 오늘 점심: ${place.name}`, t.meta, t.status, t.menu, placeUrl(place)].filter(Boolean).join('\n');
}

/** 손가락 화면(휴대폰)이면 공유 창, 마우스 화면이면 바로 클립보드 (슬랙에 붙여 넣기) */
const touchFirst = () => matchMedia('(pointer: coarse)').matches;

async function shareText() {
    const place = state.winner;
    if (!place) return;
    const text = shareBody(place);
    if (touchFirst() && navigator.share) {
        try { await navigator.share({ title: `오늘 점심: ${place.name}`, text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
        await navigator.clipboard.writeText(text);
        setStatus('복사됨 — 슬랙·카톡에 붙여 넣기');
    } catch {
        setStatus('복사 실패 — 브라우저가 클립보드를 막음');
    }
}

/* ---------- 이미지 저장: 영수증을 캔버스에 다시 그림 (외부 라이브러리 없이) ---------- */

const W = 360; // CSS 픽셀 폭, 2배로 그림
const PAD = 22;

/** 띄어쓰기 단위로 줄바꿈 (한 낱말이 한 줄보다 길면 그 낱말만 글자 단위로 자름) */
function wrap(ctx, text, max) {
    const lines = [];
    let line = '';
    const push = (word) => {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= max) { line = next; return; }
        if (line) lines.push(line);
        line = '';
        for (const ch of [...word]) {
            if (ctx.measureText(line + ch).width > max && line) { lines.push(line); line = ch; }
            else line += ch;
        }
    };
    text.split(/\s+/).filter(Boolean).forEach(push);
    if (line) lines.push(line);
    return lines;
}

async function ticketCanvas(place) {
    const body = getComputedStyle(el.resultMeta).fontFamily;
    const pixel = "'Mulmaru', ui-monospace, monospace";
    const mono = "'Mulmaru Mono', 'Mulmaru', ui-monospace, monospace";
    await Promise.all([document.fonts.load(`30px ${pixel}`, place.name), document.fonts.load(`12px ${mono}`, 'RESULT 0123')]).catch(() => {});
    const t = ticketLines(place);
    const h = hoursOf(place, new Date());

    // 먼저 줄을 나눠 높이를 잰 다음 그림
    const measure = document.createElement('canvas').getContext('2d');
    const inner = W - PAD * 2;
    measure.font = `28px ${pixel}`;
    const nameLines = wrap(measure, place.name, inner);
    measure.font = `13px ${body}`;
    const rows = [
        { text: t.meta, font: `14px ${body}`, color: '#3a362f', gap: 8 },
        t.status && { text: t.status, font: `13px ${body}`, color: '#3a362f', dot: { open: '#2f8a4a', break: '#d9902b', closed: '#c2452d' }[h?.status] },
        t.menu && { text: t.menu, font: `13px ${body}`, color: picked ? '#1d1a16' : '#6b655a', bold: Boolean(picked) },
        t.address && { text: t.address, font: `13px ${body}`, color: '#6b655a' },
    ].filter(Boolean).map((r) => {
        measure.font = r.font;
        return { ...r, lines: wrap(measure, r.dot ? `■ ${r.text}` : r.text, inner) };
    });
    const height = PAD + 14 + 22 + nameLines.length * 34 + rows.reduce((n, r) => n + (r.gap ?? 4) + r.lines.length * 19, 0) + 28 + 40 + PAD;

    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    // 감열지 바탕 + 가장자리 누렇게 + 고운 점 (무늬는 가게 id 로 고정)
    ctx.fillStyle = '#f5efe0';
    ctx.fillRect(0, 0, W, height);
    const edge = ctx.createRadialGradient(W / 2, height * 0.4, Math.min(W, height) * 0.3, W / 2, height * 0.4, Math.max(W, height) * 0.75);
    edge.addColorStop(0, 'rgba(150,120,60,0)');
    edge.addColorStop(1, 'rgba(150,120,60,.16)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, W, height);
    let seed = [...String(place.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    ctx.fillStyle = 'rgba(110,90,50,.10)';
    for (let i = 0; i < W * height / 90; i++) ctx.fillRect(rand() * W, rand() * height, 1, 1);
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, height - 2);

    let y = PAD;
    ctx.textBaseline = 'top';
    ctx.font = `11px ${mono}`;
    ctx.fillStyle = '#6b655a';
    ctx.fillText(el.resultTime.textContent, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(el.resultNo.textContent, W - PAD, y);
    ctx.textAlign = 'left';
    y += 22;
    ctx.font = `12px ${mono}`;
    ctx.fillText('RESULT', PAD, y);
    y += 16;
    ctx.font = `28px ${pixel}`;
    ctx.fillStyle = '#1d1a16';
    nameLines.forEach((line) => { ctx.fillText(line, PAD, y); y += 34; });
    rows.forEach((r) => {
        y += r.gap ?? 4;
        ctx.font = r.bold ? `bold ${r.font}` : r.font;
        r.lines.forEach((line, i) => {
            if (r.dot && i === 0) {
                ctx.fillStyle = r.dot;
                ctx.fillText('■', PAD, y);
                ctx.fillStyle = r.color;
                ctx.fillText(line.slice(1), PAD + ctx.measureText('■').width, y);
            } else {
                ctx.fillStyle = r.color;
                ctx.fillText(line, PAD, y);
            }
            y += 19;
        });
    });
    // 절취선과 천공 구멍 두 줄 (화면 영수증과 같은 무늬)
    y += 12;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#9b97b8';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 14;
    const holeRows = [...el.resultPunch.querySelectorAll('.rl-punch__row')];
    holeRows.forEach((row, r) => {
        const holes = [...row.children];
        const step = inner / holes.length;
        holes.forEach((hole, i) => {
            if (!hole.classList.contains('is-on')) return;
            ctx.fillStyle = '#2b2823';
            ctx.fillRect(PAD + i * step + step / 2 - 2, y + r * 12, 4, 7);
        });
    });
    ctx.font = `10px ${mono}`;
    ctx.fillStyle = '#8a8478';
    ctx.textAlign = 'right';
    ctx.fillText(location.host, W - PAD, height - PAD + 4);
    return canvas;
}

async function shareImage() {
    const place = state.winner;
    if (!place) return;
    el.shareImage.disabled = true;
    try {
        const canvas = await ticketCanvas(place);
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
        const name = `점심-${place.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.png`;
        const file = new File([blob], name, { type: 'image/png' });
        if (touchFirst() && navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: `오늘 점심: ${place.name}` }); return; } catch (e) { if (e?.name === 'AbortError') return; }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        setStatus('영수증 이미지 저장');
    } catch {
        setStatus('이미지 저장 실패');
    } finally {
        el.shareImage.disabled = !state.winner;
    }
}

export function initTicketExtras() {
    el.menuPick.addEventListener('click', pickMenu);
    el.shareText.addEventListener('click', shareText);
    el.shareImage.addEventListener('click', shareImage);
}
