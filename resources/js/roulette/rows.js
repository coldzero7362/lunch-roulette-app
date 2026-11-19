/** 목록 줄 부품: 아이콘 키, 키 홈, 카카오맵 링크, "[수동] [한식] 국밥 · 120m" 줄 */
import { pixelIcon } from '../pixel-icons';
import { typeLabel } from './logic/format.js';

/** 카카오맵 가게 페이지 (없으면 좌표로 지도 열기) */
export function placeUrl(place) {
    return place.url || `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
}

/** 목록 줄 오른쪽 정사각 아이콘 키 (글자 대신 픽셀 아이콘. 이름은 aria-label·툴팁으로) */
export function iconKey(tag, icon, label, tip) {
    const key = document.createElement(tag);
    key.className = 'rl-key rl-key--beige rl-key--sq';
    if (tag === 'button') key.type = 'button';
    key.setAttribute('aria-label', label);
    key.title = tip;
    key.append(pixelIcon(icon));
    return key;
}

/** 키 묶음을 매립 홈(.rl-well)에 담음 */
export function well(...keys) {
    const w = document.createElement('span');
    w.className = 'rl-well';
    w.append(...keys);
    return w;
}

/** [상세]: 카카오맵 가게 페이지를 새 탭으로 */
export function detailLink(place) {
    const a = iconKey('a', 'external-link', `${place.name} 카카오맵에서 보기 (새 탭)`, '상세 · 카카오맵');
    a.href = placeUrl(place);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
}

/** "[수동] [한식] 국밥 · 120m" */
export function metaLine(place, pinned) {
    const meta = document.createElement('p');
    meta.className = 'rl-track__meta truncate';
    if (pinned) {
        const pin = document.createElement('span');
        pin.className = 'rl-tag rl-tag--pin';
        pin.textContent = '수동';
        meta.append(pin);
    }
    if (place.type) {
        const tag = document.createElement('span');
        tag.className = 'rl-tag';
        tag.textContent = typeLabel(place.type);
        meta.append(tag);
    }
    const detail = place.category && place.category !== place.type ? `${place.category} · ` : '';
    meta.append(`${detail}${place.distance}m`);
    return meta;
}
