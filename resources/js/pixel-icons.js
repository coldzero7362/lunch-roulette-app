/*!
 * 1bit 픽셀 아이콘: Pixelarticons 2.4.2 (https://github.com/halfmage/pixelarticons)
 * @license MIT — Copyright (c) 2019 Gerrit Halfmann. 전문: /licenses/pixelarticons-LICENSE.txt
 */

// 24×24 격자 위의 경로 그대로 (원본 SVG 의 path d)
const PATHS = {
    // 상세: 카카오맵 새 탭
    'external-link': [
        'M11 5H5v2h6V5ZM5 7H3v12h2V7Zm12 12H5v2h12v-2Zm2-6h-2v6h2v-6Zm-8 0H9v2h2v-2Zm2-2h-2v2h2v-2Zm2-2h-2v2h2V9Zm2-2h-2v2h2V7Zm2-2h-2v2h2V5Zm2-2h-2v8h2V3Z',
        'M21 3h-8v2h8V3Z',
    ],
    // 제외
    close: [
        'M7 19H5V17H7V19ZM19 19H17V17H19V19ZM9 15V17H7V15H9ZM17 17H15V15H17V17ZM11 15H9V13H11V15ZM15 15H13V13H15V15ZM13 13H11V11H13V13ZM11 11H9V9H11V11ZM15 11H13V9H15V11ZM9 9H7V7H9V9ZM17 9H15V7H17V9ZM7 7H5V5H7V7ZM19 7H17V5H19V7Z',
    ],
    // 후보 추가
    plus: ['M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 픽셀 아이콘 <svg>. 픽셀이 번지지 않게 원래 크기(24px)로, 모서리 보정 없이 그림 */
export function pixelIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of PATHS[name] ?? []) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.append(path);
    }
    return svg;
}
