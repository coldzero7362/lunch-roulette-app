/**
 * 입력칸을 터미널처럼: 기본 얇은 커서 대신 깜빡이는 형광 블록 커서.
 * 브라우저 커서는 모양을 바꿀 수 없어서 숨기고, 커서 위치(selectionStart)까지의 글자 폭을 재서 블록을 그 자리에 둔다.
 * 글자를 치는 동안은 켜진 채로 있다가 멈추면 다시 깜빡인다.
 */

const measure = document.createElement('canvas').getContext('2d');

export function terminalInput(input) {
    const wrap = document.createElement('span');
    wrap.className = 'rl-term';
    input.replaceWith(wrap);
    wrap.append(input);

    const cursor = document.createElement('span');
    cursor.className = 'rl-term__cursor';
    cursor.setAttribute('aria-hidden', 'true');
    wrap.append(cursor);
    input.classList.add('is-term');

    let typingTimer;

    const place = () => {
        const focused = document.activeElement === input;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        // 범위를 고른 동안은 블록 대신 기본 선택 표시
        wrap.classList.toggle('is-active', focused && start === end);
        if (!focused) return;

        const cs = getComputedStyle(input);
        measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const before = input.value.slice(0, start);
        const x = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
            + measure.measureText(before).width - input.scrollLeft;
        const max = input.clientWidth + parseFloat(cs.borderLeftWidth) - parseFloat(cs.paddingRight);
        cursor.style.left = `${Math.min(x, max)}px`;
        cursor.style.top = `${(input.offsetHeight - cursor.offsetHeight) / 2}px`;
    };

    const typing = () => {
        wrap.classList.add('is-typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => wrap.classList.remove('is-typing'), 600);
        // 입력 직후 스크롤 위치가 바뀐 뒤에 잼
        requestAnimationFrame(place);
    };

    ['focus', 'blur', 'click', 'select', 'scroll'].forEach((ev) => input.addEventListener(ev, place));
    input.addEventListener('input', typing);
    input.addEventListener('keydown', () => requestAnimationFrame(place));
    document.addEventListener('selectionchange', () => { if (document.activeElement === input) place(); });
    // 글꼴이 늦게 로드되면 폭이 바뀜
    document.fonts?.ready.then(place);
}
