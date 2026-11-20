/**
 * 영업 시간표로 '지금' 상태 계산 (순수 함수).
 * week = 서버가 준 7일치 [{ date: 'YYYY-MM-DD', off, open: 'HH:MM', close: 'HH:MM', breaks: [['HH:MM','HH:MM']] }]
 * 결과 모양은 서버 상태와 같음 { status, label, info, today } → 화면 코드는 그대로 씀
 */

/** 마감 몇 분 전부터 '곧 영업 마감' */
export const CLOSING_SOON_MIN = 30;

const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** 브라우저 현지 날짜 'YYYY-MM-DD' */
export function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

/** 오늘 영업시간 한 줄: "11:00 ~ 20:30 (브레이크 14:30 ~ 16:30)" 또는 "휴무일" */
export function dayText(day) {
    if (day.off) return '휴무일';
    const breaks = day.breaks.length ? ` (브레이크 ${day.breaks.map(([a, b]) => `${a} ~ ${b}`).join(', ')})` : '';
    return `${day.open} ~ ${day.close}${breaks}`;
}

/** 다음 영업 시작: "내일 11:00 오픈" / "11/23 11:00 오픈". 7일 안에 없으면 '' */
function nextOpenInfo(byDate, now) {
    for (let n = 1; n <= 7; n++) {
        const day = byDate.get(dateKey(addDays(now, n)));
        if (day && !day.off) {
            const d = addDays(now, n);
            return `${n === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()}`} ${day.open} 오픈`;
        }
    }
    return '';
}

function openState(day, minutesLeft) {
    return {
        status: 'open',
        label: minutesLeft <= CLOSING_SOON_MIN ? '곧 영업 마감' : '영업 중',
        info: `${day.close} 까지`,
    };
}

/**
 * now 시각의 상태. 시간표에 오늘(또는 자정을 넘겨 이어지는 어제) 정보가 없으면 null (= 모름)
 */
export function statusAt(week, now = new Date()) {
    if (!Array.isArray(week) || !week.length) return null;
    const byDate = new Map(week.map((d) => [d.date, d]));
    const t = now.getHours() * 60 + now.getMinutes();

    // 어제 영업이 자정을 넘겨 아직 이어지는 중 (예: 19:00 ~ 03:00, 지금 01:30)
    const yesterday = byDate.get(dateKey(addDays(now, -1)));
    if (yesterday && !yesterday.off && toMin(yesterday.close) <= toMin(yesterday.open) && t < toMin(yesterday.close)) {
        return { ...openState(yesterday, toMin(yesterday.close) - t), today: dayText(yesterday) };
    }

    const day = byDate.get(dateKey(now));
    if (!day) return null;
    const today = dayText(day);

    if (day.off) return { status: 'closed', label: '휴무일', info: nextOpenInfo(byDate, now), today };

    const open = toMin(day.open);
    const close = toMin(day.close) <= open ? toMin(day.close) + 1440 : toMin(day.close); // 자정 넘김

    if (t < open) return { status: 'closed', label: '영업 전', info: `${day.open} 오픈`, today };
    if (t >= close) return { status: 'closed', label: '영업 마감', info: nextOpenInfo(byDate, now), today };

    for (const [from, to] of day.breaks) {
        let a = toMin(from);
        let b = toMin(to);
        if (a < open) { a += 1440; b += 1440; } // 자정 넘긴 뒤의 브레이크
        if (b <= a) b += 1440;
        if (t >= a && t < b) return { status: 'break', label: '브레이크타임', info: `${to} 오픈`, today };
    }

    return { ...openState(day, close - t), today };
}
