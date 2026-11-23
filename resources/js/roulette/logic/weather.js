/**
 * 날씨 보정 (순수 함수). 비·눈·폭염·한파면 가까운 곳 위주로 뽑는다.
 * hour = 서버 /weather 의 한 시간 { rain: mm, prob: %, feels: 체감 °C }
 */

export const RAIN_MM = 0.3; // 이 이상 오면 비
export const RAIN_PROB = 60; // 강수확률 이 이상이면 비로 봄
export const HOT = 31; // 체감 이 이상이면 폭염
export const COLD = -5; // 체감 이 이하면 한파
export const FAR_MIN = 0.35; // 반경 끝 가게의 배수 (가장 작은 값)
export const NEAR_MAX = 200; // 이 거리까지는 그대로 (반경의 40% 가 더 작으면 그쪽)

/** 나쁜 날씨 종류: 'rain' | 'hot' | 'cold' | null (비가 먼저) */
export function badWeather(hour) {
    if (!hour) return null;
    if (hour.rain >= RAIN_MM || (hour.prob ?? 0) >= RAIN_PROB) return 'rain';
    if (hour.feels !== null && hour.feels !== undefined) {
        if (hour.feels >= HOT) return 'hot';
        if (hour.feels <= COLD) return 'cold';
    }
    return null;
}

/**
 * 거리 배수: near 까지 1, 반경 끝까지 직선으로 줄어 FAR_MIN 에서 멈춤.
 *   near = min(200m, 반경 × 0.4)
 *   f(d) = 1 − (1 − 0.35) × (d − near) / (반경 − near)
 */
export function distanceFactor(distance, radius) {
    const near = Math.min(NEAR_MAX, radius * 0.4);
    if (distance <= near) return 1;
    if (distance >= radius) return FAR_MIN;
    return 1 - (1 - FAR_MIN) * ((distance - near) / (radius - near));
}

/** 상태 줄 문구 */
export const WEATHER_TEXT = { rain: '비 예보', hot: '폭염', cold: '한파' };
