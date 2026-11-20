/**
 * 천공 카드 띠 (순수 함수): 숫자 문자열을 열마다 구멍 하나로.
 * 실제 천공 카드처럼 열 하나 = 숫자 하나, 0~9 줄 중 그 숫자 자리에 구멍.
 */

/** 영수증에 찍을 숫자: 가게 ID + 시각(HHMM) + 거리(4자리) */
export function punchDigits(place, date = new Date()) {
    const id = String(place.id ?? '').replace(/\D/g, '');
    const time = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    const distance = String(Math.min(9999, Math.max(0, Math.round(place.distance ?? 0)))).padStart(4, '0');
    return `${id}${time}${distance}`;
}

/**
 * 열 columns 개: 각 열에 구멍 뚫을 줄(0~9) 또는 null(빈 열).
 * 숫자가 열보다 많으면 앞에서부터 자르고, 적으면 뒤는 빈 열.
 */
export function punchColumns(digits, columns) {
    return Array.from({ length: columns }, (_, i) => {
        const d = digits[i];
        return d !== undefined && /\d/.test(d) ? Number(d) : null;
    });
}
