/** 화면 전체가 함께 보는 상태 하나 */
import { SLOTS_DEFAULT } from './constants.js';

export const state = {
    center: null,
    place: null, // 지금 중심이 어디서 왔는지 { label, accuracy }
    radius: 500,
    pool: [], // 반경 안 전체 식당
    poolLoaded: false, // 반경 검색을 한 번이라도 마쳤는지 (단계 표시등)
    excluded: new Set(), // 사용자가 뺀 식당 id
    candidates: [], // 돌림판에 올라간 식당
    slots: SLOTS_DEFAULT, // 돌림판 칸 수
    types: new Set(), // 고른 종류 (비면 전체)
    pinned: new Map(), // 메뉴 찾기로 직접 넣은 식당 (id → place). 섞어도 빠지지 않음
    searchResults: [],
    rotation: 0,
    spinning: false,
    winner: null,
    requestId: 0,
    hours: new Map(), // 가게 id → { status, label, info, today, at } 지금 영업 상태
    openOnly: false, // 켜면 영업 중(또는 정보 없음)인 후보만 추첨
    checking: false, // 자동 채움·돌리기 전에 영업 상태 확인 중
    locating: false, // 기기 위치를 묻는 중 (GPS 표시등)
    hoursAt: 'now', // 영업 확인 기준 시각: 'now' | 'HH:MM'
};
