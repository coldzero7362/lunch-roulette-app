/** 카세트 A면(후보) / B면(메뉴 검색) 탭 */
import { $, el } from './dom.js';

export function selectTab(tab) {
    el.tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
    });
}

/** B면(메뉴 검색)을 열고 검색칸에 커서 */
export function openMenuSearch() {
    selectTab($('tab-b'));
    el.searchInput.focus();
}

export function initTabs() {
    el.tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = el.tabs[(i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length];
            selectTab(next);
            next.focus();
        });
    });
}
