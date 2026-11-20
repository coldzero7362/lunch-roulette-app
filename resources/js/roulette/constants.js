/** 점심 룰렛 공용 상수 (DOM·window 를 쓰지 않음: 테스트에서도 그대로 불러옴) */

export const SLOTS_MIN = 2; // 돌림판 칸 수 범위
export const SLOTS_MAX = 12;
export const SLOTS_DEFAULT = 8;

/** localStorage 키 */
export const KEYS = {
    slots: 'lunch-roulette:slots',
    place: 'lunch-roulette:place', // 직접 고른 위치 (검색·지도 클릭)
    log: 'lunch-roulette:log', // 오늘 결과 기록 (날짜별)
    openOnly: 'lunch-roulette:open-only', // 영업중 토글
    crt: 'lunch-roulette:crt',
    hours: 'lunch-roulette:hours', // 오늘 받은 가게별 영업 시간표
};

export const ACCURACY_WARN_M = 1000; // 기기 위치 오차가 이보다 크면 안내
export const HOURS_TTL_MS = 10 * 60 * 1000; // 영업 상태 재조회 간격 (서버 캐시와 같음)
export const HOURS_RETRY_MS = 60 * 1000; // 영업 상태를 못 받았을 때 다시 물어보기까지
export const HOURS_BATCH = 40; // 서버가 한 번에 받는 가게 수
export const MAP_HOURS_LIMIT = 300; // 영업중 필터일 때 지도 핀용으로 영업시간을 받아 둘 가까운 가게 수
export const WALK_M_PER_MIN = 67; // 도보 약 4km/h
export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 위치를 못 받을 때: 서울시청
export const CLOSEUP_LEVEL = 2; // 당첨 가게 클로즈업 (약 30m 축척, 묶음이 풀려 골목까지 보임)
export const LOG_ROWS = 5; // 오늘 기록 줄 수 (빈 줄 포함 고정)

// 카세트 스킨: 70년대 색 띠와 철판·라벨 색을 번갈아. ink = 그 위 글자색 (대비 확보)
export const SLICES = [
    { fill: '#f2b632', ink: '#2b2620' },
    { fill: '#ddd6c4', ink: '#2b2620' },
    { fill: '#e0662a', ink: '#2b2620' },
    { fill: '#aba38f', ink: '#2b2620' },
    { fill: '#c8442a', ink: '#f5efe0' },
    { fill: '#e9e3d4', ink: '#2b2620' },
    { fill: '#6b3a1e', ink: '#f2b632' },
    { fill: '#c4bca8', ink: '#2b2620' },
];

/** 영업중 필터에 걸린 칸·트랙 번호 색 */
export const SHUT_TONE = { fill: '#5a5247', ink: '#aba38f' };

export const INK = '#2b2620';
export const SIGNAL = '#d25a22';
