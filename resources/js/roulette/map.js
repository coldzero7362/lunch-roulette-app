/**
 * 카카오 지도: 중심(현재 위치·직접 고른 위치), 반경 원, 식당 핀 묶음, 당첨 가게 클로즈업.
 */
import { CLOSEUP_LEVEL, DEFAULT_CENTER, KEYS, SIGNAL } from './constants.js';
import { $, el, REDUCED_MOTION } from './dom.js';
import { fetchPlaces } from './places.js';
import { setStatus, updateReadout } from './readout.js';
import { state } from './state.js';

let map, centerOverlay, radiusCircle, winnerOverlay, winnerMarker, clusterer, pin;
// 지도가 준비되기 전에 받은 위치는 여기 두었다가 지도가 뜨면 적용
let pendingCenter = null;

export function initMap() {
    if (!window.kakao?.maps) {
        setStatus('지도 로드 실패 — 새로고침');
        return;
    }

    kakao.maps.load(() => {
        map = new kakao.maps.Map($('map'), {
            center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: 4,
        });
        clusterer = createClusterer();

        kakao.maps.event.addListener(map, 'click', (e) => {
            choosePlace(e.latLng.getLat(), e.latLng.getLng(), '지도 선택 지점');
        });

        if (pendingCenter) {
            setCenter(pendingCenter.lat, pendingCenter.lng, pendingCenter.place);
            pendingCenter = null;
        }
    });
}

function getPosition(options) {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

/**
 * 현재 위치를 받아 지도 가운데로. 정밀 위치가 실패하면(시간 초과·찾지 못함) 대략적인 위치로 한 번 더 시도한다.
 * 페이지를 열 때 한 번, 내 위치 키를 누를 때마다 부른다.
 */
export async function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
        setStatus('위치 사용 불가(HTTP) — 지도 선택 또는 위치 검색');
        return;
    }
    if (state.locating) return;

    state.locating = true;
    updateReadout();
    el.locate.disabled = true;
    setStatus('위치 확인 중');

    try {
        let pos;
        try {
            pos = await getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
        } catch (e) {
            if (e.code === 1) throw e; // 권한 거부는 다시 물어도 같다
            setStatus('정밀 위치 실패 — 대략 위치로 재시도');
            pos = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        }
        applyCenter(pos.coords.latitude, pos.coords.longitude, { label: '현재 위치', accuracy: pos.coords.accuracy });
    } catch (e) {
        setStatus(locateErrorMessage(e));
    } finally {
        state.locating = false;
        updateReadout();
        el.locate.disabled = false;
    }
}

function locateErrorMessage(e) {
    switch (e?.code) {
        case 1: return '위치 권한 없음 — 주소창 자물쇠에서 허용, 또는 지도 선택';
        case 2: return '위치 확인 불가 — 기기 위치 서비스 확인, 또는 지도 선택';
        case 3: return '위치 응답 시간 초과 — 재시도 또는 지도 선택';
        default: return '위치 확인 실패 — 지도 선택 또는 위치 검색';
    }
}

export function applyCenter(lat, lng, place = null) {
    if (!map) {
        pendingCenter = { lat, lng, place };
        return;
    }
    setCenter(lat, lng, place);
}

/** @param place {label, accuracy} 상태 표시에 쓰는 출처 정보 */
function setCenter(lat, lng, place = null) {
    state.center = { lat, lng };
    state.place = place;
    updateReadout();
    const pos = new kakao.maps.LatLng(lat, lng);

    centerOverlay?.setMap(null);
    centerOverlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: '<div style="width:16px;height:16px;border-radius:50%;background:#d25a22;border:3px solid #e9e3d4;box-shadow:0 0 0 2px #2b2620"></div>',
        zIndex: 3,
    });
    centerOverlay.setMap(map);

    drawRadius();
    map.panTo(pos);
    fetchPlaces();
}

export function drawRadius() {
    radiusCircle?.setMap(null);
    if (!state.center) return;

    radiusCircle = new kakao.maps.Circle({
        center: new kakao.maps.LatLng(state.center.lat, state.center.lng),
        radius: state.radius,
        strokeWeight: 2,
        strokeColor: SIGNAL,
        strokeOpacity: 0.9,
        strokeStyle: 'shortdash',
        fillColor: SIGNAL,
        fillOpacity: 0.07,
    });
    radiusCircle.setMap(map);
    map.setLevel(radiusLevel());
}

/** 반경 원이 다 보이는 지도 레벨 */
function radiusLevel() {
    return state.radius >= 1000 ? 6 : state.radius >= 500 ? 5 : 4;
}

/** 당첨 가게로 이동한 뒤 가까이 확대 */
function closeUp(pos) {
    if (REDUCED_MOTION) {
        map.setLevel(CLOSEUP_LEVEL);
        map.setCenter(pos);
        return;
    }
    map.panTo(pos);
    // 이동이 끝난 뒤 지도 가운데(=가게)를 기준으로 부드럽게 확대
    setTimeout(() => map.setLevel(CLOSEUP_LEVEL, { animate: { duration: 600 } }), 450);
}

/** 클로즈업했던 지도를 반경 전체가 보이게 되돌림 */
export function restoreView() {
    if (!map || !state.center) return;
    const center = new kakao.maps.LatLng(state.center.lat, state.center.lng);
    if (REDUCED_MOTION) {
        map.setLevel(radiusLevel());
        map.setCenter(center);
        return;
    }
    // 확대·이동 애니메이션을 동시에 걸면 이동이 묻히므로 축소가 끝난 뒤 이동
    map.setLevel(radiusLevel(), { animate: { duration: 400 } });
    setTimeout(() => map.panTo(center), 420);
}

/**
 * 가까운 마커는 개수가 적힌 원 하나로 묶는다 (번화가는 반경 안 식당이 수백 곳이라 핀이 겹침).
 * 지도를 확대하면(레벨 3 이하) 낱개 핀으로 풀린다.
 */
function createClusterer() {
    const style = (size, bg, font) => ({
        width: `${size}px`, height: `${size}px`, lineHeight: `${size - 4}px`,
        background: bg, color: '#2b2620', border: '2px solid #2b2620', borderRadius: '50%',
        textAlign: 'center', font: `${font}px/${size - 4}px 'Mulmaru Mono', monospace`,
        boxShadow: '0 3px 0 rgb(43 38 32 / .45)',
    });
    return new kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 4,
        gridSize: 56,
        calculator: [10, 40],
        // 바탕만 10% 투명 (숫자·테두리는 그대로 선명하게): 아래 지도 글자가 살짝 비침
        styles: [style(34, 'rgb(242 182 50 / .9)', 13), style(42, 'rgb(224 102 42 / .9)', 14), style(50, 'rgb(200 68 42 / .9)', 15)],
    });
}

export function drawMarkers() {
    if (!map) return;
    const shown = new Map(state.pool.map((p) => [p.id, p]));
    state.pinned.forEach((p, id) => shown.set(id, p));
    const markers = [...shown.values()]
        .filter((p) => !state.excluded.has(p.id))
        .map((p) => new kakao.maps.Marker({
            position: new kakao.maps.LatLng(p.lat, p.lng),
            title: p.name,
            image: markerImage(),
        }));
    clusterer.clear();
    clusterer.addMarkers(markers);
}

/** 카세트 스킨 핀: 번트 오렌지 몸통, 카본 테두리, 베이지 점 */
function markerImage() {
    if (!pin) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
            + '<path d="M13 32 C13 32 2 19 2 12 A11 11 0 0 1 24 12 C24 19 13 32 13 32 Z" fill="#d25a22" stroke="#2b2620" stroke-width="2.5"/>'
            + '<rect x="9" y="8" width="8" height="8" fill="#e9e3d4" stroke="#2b2620" stroke-width="1.5"/></svg>';
        pin = new kakao.maps.MarkerImage(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            new kakao.maps.Size(26, 34),
            { offset: new kakao.maps.Point(13, 33) },
        );
    }
    return pin;
}

export function highlightWinner(place) {
    clearWinnerMarker();
    const label = document.createElement('div');
    label.textContent = `▶ ${place.name}`;
    label.style.cssText = "padding:7px 10px;border:2px solid #3f382f;border-radius:4px;background:#0e120f;color:#ffb23f;text-shadow:0 0 6px rgb(255 178 63 / .6);font:14px/1 'Mulmaru',monospace;letter-spacing:.04em;white-space:nowrap;transform:translateY(-54px);box-shadow:0 0 0 1.5px #2b2620";

    const pos = new kakao.maps.LatLng(place.lat, place.lng);
    // 당첨 핀은 묶음(클러스터)에 넣지 않고 따로 띄워 항상 보이게
    winnerMarker = new kakao.maps.Marker({ position: pos, title: place.name, image: markerImage(), zIndex: 4, map });
    winnerOverlay = new kakao.maps.CustomOverlay({ position: pos, content: label, zIndex: 5 });
    winnerOverlay.setMap(map);
    closeUp(pos);
}

export function clearWinnerMarker() {
    winnerOverlay?.setMap(null);
    winnerMarker?.setMap(null);
}

/* ---------- 직접 고른 위치 기억 ---------- */

/** 직접 고른 위치: 중심으로 쓰고 다음 방문 때도 여기서 시작 */
export function choosePlace(lat, lng, label) {
    try { localStorage.setItem(KEYS.place, JSON.stringify({ lat, lng, label })); } catch { /* 저장 못 해도 동작 */ }
    applyCenter(lat, lng, { label });
}

export function savedPlace() {
    try {
        const p = JSON.parse(localStorage.getItem(KEYS.place) ?? 'null');
        return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
    } catch {
        return null;
    }
}

export function forgetPlace() {
    try { localStorage.removeItem(KEYS.place); } catch { /* 무시 */ }
}
