/**
 * 이번 달 점심 통계 (순수 함수). history = [{ id, name, type, category, day: 'YYYY-MM-DD', price? }] (최신이 앞)
 */

/**
 * @param {string} month 'YYYY-MM'
 * @returns {{ count: number, types: { type: string, n: number }[], top: { name: string, n: number }[], spend: number, priced: number, avg: number|null }}
 */
export function monthStats(history, month) {
    const items = (history ?? []).filter((h) => h.day?.startsWith(`${month}-`));
    const tally = (key) => {
        const map = new Map();
        for (const h of items) {
            const k = key(h);
            if (k) map.set(k, (map.get(k) ?? 0) + 1);
        }
        return [...map].sort((a, b) => b[1] - a[1]);
    };
    const priced = items.filter((h) => h.price > 0);
    const spend = priced.reduce((sum, h) => sum + h.price, 0);
    return {
        count: items.length,
        types: tally((h) => h.type).map(([type, n]) => ({ type, n })),
        // 두 번 이상 간 곳만 '자주 간 곳'
        top: tally((h) => h.name).filter(([, n]) => n >= 2).slice(0, 3).map(([name, n]) => ({ name, n })),
        spend,
        priced: priced.length,
        avg: priced.length ? Math.round(spend / priced.length / 100) * 100 : null,
    };
}
