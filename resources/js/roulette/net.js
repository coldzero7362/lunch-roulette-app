/** 서버 조회. NET 표시등: 조회가 하나라도 진행 중이면 깜빡임 */
import { setLamp } from './readout.js';

let inFlight = 0;

export async function api(url) {
    inFlight++;
    setLamp('net', 'busy');
    try {
        return await fetch(url, { headers: { Accept: 'application/json' } });
    } finally {
        if (--inFlight === 0) setLamp('net', 'off');
    }
}
