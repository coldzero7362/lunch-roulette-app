/**
 * 브라우저에 오래 남기는 취향: 단골(별), 다시 안 감, 최근 먹은 기록.
 * 모두 localStorage. 저장이 안 되는 환경(비공개 모드 등)에선 이번 방문 동안만 기억.
 */
import { KEYS } from './constants.js';
import { recentInfo } from './logic/recent.js';
import { dateKey } from './logic/schedule.js';

const HISTORY_MAX = 120; // 기록 개수 상한 (한 달 통계 + 넉넉히)

function read(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null');
        return v ?? fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 못 해도 이번 방문 동안은 동작 */ }
}

/** 지도·목록에 다시 쓰려고 남기는 가게 정보 (거리는 위치마다 달라서 뺌) */
const snapshot = (p) => ({ id: p.id, name: p.name, type: p.type, category: p.category, address: p.address, phone: p.phone, url: p.url, lat: p.lat, lng: p.lng });

let favorites = read(KEYS.favorites, {}); // id → 가게
let never = read(KEYS.never, {}); // id → { id, name }
let history = read(KEYS.history, []); // [{ id, name, type, category, day }] 최신이 앞
let avoid = read(KEYS.avoidRecent, true); // 최근 먹은 것 피하기 (끄면 기록만 남김)
let weather = read(KEYS.weatherOn, true); // 날씨 보정 (비·폭염·한파면 가까운 곳 위주)

/* ---------- 단골 ---------- */

export const isFavorite = (id) => Object.hasOwn(favorites, id);
export const favoriteIds = () => new Set(Object.keys(favorites));
export const favoriteList = () => Object.values(favorites);

export function toggleFavorite(place) {
    if (isFavorite(place.id)) delete favorites[place.id];
    else favorites[place.id] = snapshot(place);
    write(KEYS.favorites, favorites);
    return isFavorite(place.id);
}

/* ---------- 다시 안 감 ---------- */

export const isNever = (id) => Object.hasOwn(never, id);
export const neverList = () => Object.values(never);

export function addNever(place) {
    never[place.id] = { id: place.id, name: place.name };
    delete favorites[place.id]; // 안 갈 곳은 단골에서도 뺌
    write(KEYS.never, never);
    write(KEYS.favorites, favorites);
}

export function removeNever(id) {
    delete never[id];
    write(KEYS.never, never);
}

/* ---------- 최근 먹은 기록 ---------- */

export function addHistory(place) {
    history.unshift({ id: place.id, name: place.name, type: place.type, category: place.category, day: dateKey(new Date()) });
    history = history.slice(0, HISTORY_MAX);
    write(KEYS.history, history);
}

/** 당첨 기록에 보통 가격을 붙임 (영수증이 가게 정보를 받은 뒤, 이번 달 지출 추정용) */
export function setHistoryPrice(id, price) {
    const last = history[0];
    if (!last || last.id !== id || !price || last.price) return;
    last.price = price;
    write(KEYS.history, history);
}

/** 방금 당첨 기록을 지움 (재실행·제외: 실제로 안 간 것) */
export function dropLastHistory() {
    history.shift();
    write(KEYS.history, history);
}

/** 기록 한 줄 지우기 (history 배열 위치) */
export function removeHistory(index) {
    history.splice(index, 1);
    write(KEYS.history, history);
}

/** 기록 목록 (최신이 앞) */
export const historyList = () => history;

export const avoidRecent = () => avoid;

export function setAvoidRecent(on) {
    avoid = on;
    write(KEYS.avoidRecent, on);
}

export const weatherOn = () => weather;

export function setWeatherOn(on) {
    weather = on;
    write(KEYS.weatherOn, on);
}

const NO_RECENT = { ids: new Map(), categories: new Map(), types: new Map() };

/** 오늘 기준 최근 기록 요약 (logic/recent.recentInfo). 피하기를 끄면 빈 요약 */
export function recentNow() {
    return avoid ? recentInfo(history, dateKey(new Date())) : NO_RECENT;
}
