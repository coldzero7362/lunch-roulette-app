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
    // 후보 추가 · 후보 수 늘리기
    plus: ['M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z'],
    // 후보 수 줄이기
    minus: ['M4 11h16v2H4z'],
    // 자동 채움
    sparkles: [
        'M11 1h2v4h-2zm0 22h2v-4h-2zM9 5h2v4H9zm0 14h2v-4H9zm4-14h2v4h-2zm0 14h2v-4h-2zM5 9h4v2H5zm14 0h-4v2h4zM1 11h4v2H1zm22 0h-4v2h4zM5 13h4v2H5zm14 0h-4v2h4zm0-12h2v6h-2z',
        'M17 3h6v2h-6zM3 17h2v2H3zm-2 2h2v2H1zm2 2h2v2H3zm2-2h2v2H5z',
    ],
    // 섞기
    shuffle: ['M10 19H2v-2h8v2Zm12 0h-8v-2h8v2Zm-10-2h-2v-6h2v6Zm6-10h2v2h2v2h-2v2h-2v2h-2v-4h-4V9h4V5h2v2ZM8 11H2V9h6v2Z'],
    // 비움
    trash: ['M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z'],
    // 검색
    search: ['M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z'],
    // 단골 (별)
    star: ['M11 2h2v4h-2zM9 6h6v2H9zM2 8h20v2H2zm2 2h16v2H4zm2 2h12v2H6zm1 2h10v2H7zm-1 2h4v2H6zm8 0h4v2h-4zm-9 2h3v2H5zm11 0h3v2h-3zM4 20h2v2H4zm14 0h2v2h-2z'],
    // 현재 위치
    gps: ['M9 5h6v2H9zM7 7h2v2H7zm0 8h2v2H7zm8 0h2v2h-2zm0-8h2v2h-2zm2 2h2v6h-2zm-8 8h6v2H9zM5 9h2v6H5zm14 2h4v2h-4zM1 11h4v2H1zM11 1h2v4h-2zm0 18h2v4h-2z'],
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

/** 마크업의 [data-icon="이름"] 요소에 아이콘을 채움 (글자 대신; 이름은 aria-label·title 로) */
export function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
        if (!el.querySelector('svg')) el.append(pixelIcon(el.dataset.icon));
    });
}
