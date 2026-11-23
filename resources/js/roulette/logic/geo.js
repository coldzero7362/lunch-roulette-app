/**
 * 위치 계산 (순수 함수).
 */

/** 두 좌표 사이 거리(m), 하버사인 */
export function distanceM(a, b) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 보정한 위치로 옮길 만큼 나아졌는지: 오차가 30% 이상 줄고, 실제로 30m 넘게 떨어진 곳일 때만
 * (조금 나아진 정도로 지도·식당 목록을 다시 불러오지 않게)
 *
 * @param first {lat, lng, accuracy} 처음 반영한 위치
 * @param best  {lat, lng, accuracy} 보정 중 가장 정확했던 위치
 */
export function worthMoving(first, best) {
    return best.accuracy <= first.accuracy * 0.7 && distanceM(first, best) > 30;
}

/** 오차 표시: 45 → '±45m', 1234 → '±1.2km' */
export function accuracyLabel(m) {
    return m >= 1000 ? `±${(m / 1000).toFixed(1)}km` : `±${Math.round(m)}m`;
}
