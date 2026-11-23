<!DOCTYPE html>
<html lang="ko">
<head>
    @include('partials.head', ['title' => '점심 룰렛'])
    {{-- 링크 미리보기 (카카오톡·슬랙·디스코드 등 Open Graph, X 카드) --}}
    @php($description = '근처 식당을 룰렛으로 고릅니다. 돌려 돌려 돌림판')
    {{-- 이미지를 바꾸면 주소도 바뀌게 (?v=내용 해시): 미리보기를 캐시한 앱들이 새 이미지를 받아 가도록 --}}
    @php($ogImage = url('/og-image.jpg').'?v='.substr((string) md5_file(public_path('og-image.jpg')), 0, 8))
    <meta name="description" content="{{ $description }}">
    <meta name="theme-color" content="#3f382f">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="점심 룰렛">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:url" content="{{ url('/') }}">
    <meta property="og:title" content="점심 룰렛 — 근처 식당 돌림판">
    <meta property="og:description" content="{{ $description }}">
    <meta property="og:image" content="{{ $ogImage }}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="점심 룰렛: 레트로 계기판 모양의 식당 돌림판">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="점심 룰렛 — 근처 식당 돌림판">
    <meta name="twitter:description" content="{{ $description }}">
    <meta name="twitter:image" content="{{ $ogImage }}">
    @vite(['resources/css/roulette.css', 'resources/js/roulette.js'])
    <script nonce="{{ Vite::cspNonce() }}" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={{ config('services.kakao.js_key') }}&autoload=false&libraries=clusterer"></script>
</head>
<body class="rl-body">
    <div id="roulette-app" data-restaurants-url="{{ route('restaurants.index') }}" data-search-url="{{ route('restaurants.search') }}" data-locations-url="{{ route('locations.search') }}" data-hours-url="{{ route('restaurants.hours') }}" class="rl-device">

        {{-- 머리 패널: 단계 표시등 --}}
        <header class="rl-head rl-ribs">
            <div>
                <h1 class="rl-title">점심 룰렛</h1>
                <span class="rl-model">MODEL LR-01 · LUNCH ROULETTE</span>
            </div>
            <ol id="steps" class="rl-steps" aria-label="진행 단계">
                <li data-step="loc"><span class="rl-lamp rl-steps__lamp" aria-hidden="true"></span><span class="rl-steps__no">01</span>LOCATE</li>
                <li data-step="cond"><span class="rl-lamp rl-steps__lamp" aria-hidden="true"></span><span class="rl-steps__no">02</span>FILTER</li>
                <li data-step="cand"><span class="rl-lamp rl-steps__lamp" aria-hidden="true"></span><span class="rl-steps__no">03</span>LOAD</li>
                <li data-step="spin"><span class="rl-lamp rl-steps__lamp" aria-hidden="true"></span><span class="rl-steps__no">04</span>SPIN</li>
            </ol>
        </header>
        <div class="rl-stripes" aria-hidden="true"></div>

        {{--
            상태 표시창: 산업용 계기판. 라벨은 베젤에 인쇄, 액정 창엔 값만 (숫자는 7세그먼트, 고정 자릿수).
            창마다 고무 패킹 + 덮개 유리, 귀퉁이 나사, 왼쪽 아래 표시등 (PWR / GPS / NET)
        --}}
        <div class="rl-readout rl-lcd">
            <span class="rl-screw tl" aria-hidden="true"></span>
            <span class="rl-screw tr" aria-hidden="true"></span>
            <span class="rl-screw bl" aria-hidden="true"></span>
            <span class="rl-screw br" aria-hidden="true"></span>
            <dl class="rl-readout__fields">
                <div><dt>LOC</dt><dd><span id="f-loc" class="rl-lcd__val">—</span><span id="f-coord" class="rl-lcd__sub">--.---N ---.---E</span></dd></div>
                <div><dt>RANGE</dt><dd id="f-range">0500 M</dd></div>
                <div><dt>TYPE</dt><dd id="f-type">전체</dd></div>
                <div><dt>FOUND</dt><dd id="f-found">--- EA</dd></div>
                <div><dt>WHEEL</dt><dd id="f-wheel">00/08</dd></div>
            </dl>
            <div class="rl-readout__foot">
                <ul class="rl-lamps" aria-hidden="true">
                    <li><span id="lamp-pwr" class="rl-lamp" data-color="green" data-state="on"></span>PWR</li>
                    <li><span id="lamp-gps" class="rl-lamp" data-color="green" data-state="off"></span>GPS</li>
                    <li><span id="lamp-net" class="rl-lamp" data-color="amber" data-state="off"></span>NET</li>
                    <li><span id="lamp-wx" class="rl-lamp" data-color="amber" data-state="off"></span>WX</li>
                </ul>
                <p class="rl-readout__msg"><span class="rl-lcd__mark" aria-hidden="true">▶</span><span id="status" role="status" aria-live="polite">BOOT</span></p>
            </div>
        </div>

        <main class="rl-main">
            {{-- 장식: 위 표시창 뒤에서 나와 콘솔 뒤로 들어가는 전선 3가닥 (나일론 타이 + 번호 꼬리표) --}}
            <div class="rl-cables" aria-hidden="true">
                <span class="rl-cables__wire rl-cables__wire--red"></span>
                <span class="rl-cables__wire rl-cables__wire--black"></span>
                <span class="rl-cables__wire rl-cables__wire--amber"></span>
                <span class="rl-cables__tie"></span>
                <span class="rl-cables__tag">J1</span>
            </div>

            {{-- 01 위치 · 02 조건: 한 장비 --}}
            <section class="rl-console rl-ribs" aria-label="위치와 조건">
                <span class="rl-screw tl" aria-hidden="true"></span>
                <span class="rl-screw tr" aria-hidden="true"></span>
                <span class="rl-screw bl" aria-hidden="true"></span>
                <span class="rl-screw br" aria-hidden="true"></span>

                <div class="rl-locate">
                    <form id="loc-form" class="rl-locate__bar" role="search">
                        <label for="loc-input" class="rl-console__label">01 LOC</label>
                        <input id="loc-input" type="search" class="rl-search__input" placeholder="역 · 건물 · 도로명 주소" maxlength="50" autocomplete="off" enterkeyhint="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="loc-results">
                        <div class="rl-well rl-well--dark">
                            <button type="submit" class="rl-key rl-key--beige rl-key--sq rl-key--sq-lg" data-icon="search" aria-label="위치 검색" title="검색"></button>
                            <button id="locate" type="button" class="rl-key rl-key--beige rl-key--sq rl-key--sq-lg" data-icon="gps" aria-label="현재 위치 사용" title="현재 위치"></button>
                        </div>
                    </form>
                    <div id="loc-pop" class="rl-locate__pop" hidden>
                        <div class="rl-locate__head">
                            <span id="loc-head">RESULT</span>
                            <span class="rl-locate__keys" aria-hidden="true">↑↓ 선택 · ENTER 확정 · ESC 닫기</span>
                            <button id="loc-close" type="button" class="rl-locate__close" aria-label="결과 닫기" data-icon="close"></button>
                        </div>
                        <ul id="loc-results" class="rl-locate__results rl-scroll" role="listbox" aria-label="위치 검색 결과"></ul>
                    </div>
                </div>

                <div id="map-screen" class="rl-map is-crt">
                    <div id="map" class="rl-map__canvas"></div>
                    {{-- CRT 효과 층: 클릭은 지도로 통과 --}}
                    <div class="rl-crt-fx" aria-hidden="true"></div>
                </div>

                <div class="rl-console__row">
                <div class="rl-console__controls">
                    <div class="rl-bank" role="group" aria-labelledby="lbl-range">
                        <span id="lbl-range" class="rl-console__label">RANGE</span>
                        <div class="rl-bank__slot">
                            @foreach (\App\Http\Controllers\RestaurantController::RADII as $radius)
                                <button type="button" class="rl-bank__key" data-radius="{{ $radius }}" aria-pressed="{{ $radius === 500 ? 'true' : 'false' }}">{{ $radius >= 1000 ? ($radius / 1000).'km' : $radius.'m' }}</button>
                            @endforeach
                        </div>
                    </div>
                    <div class="rl-bank rl-bank--wide" role="group" aria-labelledby="lbl-type">
                        <span id="lbl-type" class="rl-console__label">02 TYPE</span>
                        <div class="rl-bank__slot">
                            <button type="button" class="rl-bank__key" data-type="" aria-pressed="true">전체</button>
                            @foreach (\App\Services\KakaoLocal::TYPES as $type)
                                <button type="button" class="rl-bank__key" data-type="{{ $type }}" aria-pressed="false">{{ $type === '술집' ? '주점' : $type }}</button>
                            @endforeach
                        </div>
                    </div>
                    <div class="rl-bank" role="group" aria-labelledby="lbl-hours">
                        <span id="lbl-hours" class="rl-console__label">HOURS</span>
                        <div class="rl-bank__slot">
                            <button id="open-toggle" type="button" class="rl-bank__key" aria-pressed="false" title="켜면 영업 중인 후보만 추첨 (기준 시각은 옆 키)">영업중</button>
                            <button id="hours-at" type="button" class="rl-bank__key rl-bank__key--at" aria-pressed="false" title="영업 확인 기준 시각: 누를 때마다 지금 → 12:00 → 12:30">지금</button>
                            <button id="budget-key" type="button" class="rl-bank__key rl-bank__key--at rl-bank__key--gap" aria-pressed="false" title="예산: 누를 때마다 전체 → 1만 원 → 1.5만 원. 보통 메뉴 가격(중간값)이 넘는 곳은 추첨 제외 (메뉴판 없는 곳은 포함)">예산</button>
                        </div>
                    </div>
                    <div class="rl-bank" role="group" aria-labelledby="lbl-fx">
                        <span id="lbl-fx" class="rl-console__label">FX</span>
                        <div class="rl-bank__slot">
                            <button id="crt-toggle" type="button" class="rl-bank__key" aria-pressed="true">CRT</button>
                        </div>
                    </div>
                </div>

                {{-- 장식: 타공 스피커 그릴 (넓은 화면에서 컨트롤 오른쪽 빈자리) --}}
                <div class="rl-speaker" aria-hidden="true">
                    <div class="rl-speaker__grille">
                        <span class="rl-screw tl"></span>
                        <span class="rl-screw tr"></span>
                        <span class="rl-screw bl"></span>
                        <span class="rl-screw br"></span>
                    </div>
                </div>
                </div>
            </section>

            <section class="rl-side" aria-label="룰렛">
                {{-- 04 돌리기 --}}
                <div class="rl-deck rl-ribs">
                    <span class="rl-screw tl" aria-hidden="true"></span>
                    <span class="rl-screw tr" aria-hidden="true"></span>
                    <span class="rl-screw bl" aria-hidden="true"></span>
                    <span class="rl-screw br" aria-hidden="true"></span>

                    <div class="rl-window">
                        {{--
                            바늘: 전축 톤암 (위에서 본 모습). 원판 바깥 테 위의 회전축에서 시작.
                            널링 링 + 돌려 깎은 알루미늄 캡 / 원통 파이프 암 / 헤드쉘 판 + 빨간 카트리지 (끝이 결과 지점)
                        --}}
                        <div class="rl-pointer rl-arm" aria-hidden="true">
                            <span class="rl-arm__tube"></span>
                            <span class="rl-arm__head"></span>
                            <span class="rl-arm__cart"></span>
                            <span class="rl-arm__base"></span>
                        </div>
                        <svg id="wheel" viewBox="-100 -100 200 200" class="rl-wheel" role="img" aria-label="돌림판. 칸 번호는 SIDE A 후보 번호와 같음">
                            <g id="wheel-rotor"></g>
                            <circle r="98.5" fill="none" stroke="#2b2620" stroke-width="3"/>
                        </svg>
                    </div>

                    <div class="rl-deck__controls">
                        <span class="rl-console__label">04 SPIN</span>
                        <div class="rl-well rl-well--dark rl-well--block">
                            <button id="spin" type="button" disabled class="rl-key rl-key--wide rl-spin" aria-label="돌리기"><span class="rl-spin__tri" aria-hidden="true"></span><span class="rl-spin__label">SPIN</span></button>
                        </div>
                        <p class="rl-deck__hint">SLOT NO. = TRACK NO. · NEEDLE = RESULT</p>
                    </div>
                </div>

                {{-- 03 후보: 카세트 A면 / B면 --}}
                {{-- 상아색 모듈: 선택 키(SIDE A/B) + 판에 파인 목록 창(투명 덮개) --}}
                <div class="rl-jcard rl-jcard--full rl-ivory">
                    <span class="rl-screw tl" aria-hidden="true"></span>
                    <span class="rl-screw tr" aria-hidden="true"></span>
                    <span class="rl-screw bl" aria-hidden="true"></span>
                    <span class="rl-screw br" aria-hidden="true"></span>
                    <div class="rl-stripes rl-ivory__stripe" aria-hidden="true"></div>
                    <div class="rl-tabs" role="tablist" aria-label="03 후보">
                        <button id="tab-a" type="button" role="tab" class="rl-tabs__tab" aria-selected="true" aria-controls="panel-a"><span class="rl-tabs__side">SIDE A</span><span class="rl-tabs__name">후보 <span id="candidate-count" class="rl-jcard__count">0/8</span></span></button>
                        <button id="tab-b" type="button" role="tab" class="rl-tabs__tab" aria-selected="false" aria-controls="panel-b" tabindex="-1"><span class="rl-tabs__side">SIDE B</span><span class="rl-tabs__name">메뉴 검색</span></button>
                        <button id="tab-c" type="button" role="tab" class="rl-tabs__tab" aria-selected="false" aria-controls="panel-c" tabindex="-1"><span class="rl-tabs__side">SIDE C</span><span class="rl-tabs__name">단골·기록</span></button>
                    </div>

                    <div id="panel-a" role="tabpanel" aria-labelledby="tab-a">
                        <div class="rl-jcard__tools">
                            <div class="rl-well rl-legend" data-legend="LOAD" role="group" aria-label="후보 채우기">
                                <button id="auto" type="button" class="rl-key rl-key--beige rl-key--sq rl-key--cap" data-icon="sparkles" aria-label="자동 채움" title="빈 칸을 반경 안 식당으로 채움" disabled><span class="rl-key__cap" aria-hidden="true">채우기</span></button>
                                <button id="shuffle" type="button" class="rl-key rl-key--beige rl-key--sq rl-key--cap" data-icon="shuffle" aria-label="섞기" title="자동으로 넣은 후보를 다시 뽑고 순서를 섞음" disabled><span class="rl-key__cap" aria-hidden="true">섞기</span></button>
                                <button id="clear" type="button" class="rl-key rl-key--beige rl-key--sq rl-key--cap" data-icon="trash" aria-label="비움" title="후보를 모두 비움" disabled><span class="rl-key__cap" aria-hidden="true">비우기</span></button>
                            </div>
                            <div class="rl-well rl-stepper rl-legend" data-legend="QTY" role="group" aria-label="후보 수">
                                <button id="slots-down" type="button" class="rl-key rl-key--beige rl-key--sq" data-icon="minus" aria-label="후보 수 감소" title="후보 수 −"></button>
                                <output id="slots" class="rl-counter" aria-live="polite" aria-label="후보 수 08"><span class="rl-drum"><span class="rl-drum__digit">0</span></span><span class="rl-drum"><span class="rl-drum__digit">8</span></span></output>
                                <button id="slots-up" type="button" class="rl-key rl-key--beige rl-key--sq" data-icon="plus" aria-label="후보 수 증가" title="후보 수 +"></button>
                            </div>
                        </div>
                        <span class="rl-ivory__legend" aria-hidden="true">TRACK LIST</span>
                        <div class="rl-ivory__window"><ul id="candidates" class="m-0 list-none p-0"></ul></div>
                    </div>

                    <div id="panel-b" role="tabpanel" aria-labelledby="tab-b" hidden>
                        <form id="search-form" class="rl-search" role="search">
                            <label for="search-input" class="sr-only">메뉴 또는 가게 이름</label>
                            <input id="search-input" type="search" class="rl-search__input" placeholder="메뉴 · 가게 이름" maxlength="30" autocomplete="off" enterkeyhint="search">
                            <div class="rl-well">
                                <button type="submit" class="rl-key rl-key--beige rl-key--sq rl-key--sq-lg" data-icon="search" aria-label="메뉴 검색" title="검색"></button>
                            </div>
                        </form>
                        <span class="rl-ivory__legend" aria-hidden="true">RESULTS</span>
                        <div class="rl-ivory__window">
                            <p id="search-status" class="rl-track__empty" aria-live="polite">반경 내 메뉴 검색 → [+]로 후보 추가</p>
                            <ul id="search-results" class="rl-search__results rl-scroll m-0 list-none p-0"></ul>
                        </div>
                    </div>

                    <div id="panel-c" role="tabpanel" aria-labelledby="tab-c" hidden>
                        <div class="rl-saved__bar">
                            <span class="rl-saved__note">이 브라우저에만 저장돼요</span>
                            <div class="rl-bank__slot"><button id="avoid-toggle" type="button" class="rl-bank__key" aria-pressed="true" title="켜면 최근 일주일 안에 먹은 곳은 자동 채움에서 빼고, 최근 먹은 종류는 덜 뽑음">최근 피하기</button><button id="weather-toggle" type="button" class="rl-bank__key" aria-pressed="true" title="켜면 비·눈·폭염·한파 예보 때 가까운 곳 위주로 뽑음 (먼 곳은 최소 0.35배)">날씨 보정</button></div>
                        </div>
                        <span class="rl-ivory__legend" aria-hidden="true">LIBRARY</span>
                        <div class="rl-ivory__window">
                            <ul id="saved-list" class="rl-search__results rl-scroll m-0 list-none p-0"></ul>
                        </div>
                    </div>
                </div>

            </section>

            {{-- 결과 프린터: 자리를 항상 차지해서 결과가 나와도 아래가 밀리지 않음 --}}
            <div class="rl-printer rl-ribs" aria-label="결과">
                <span class="rl-console__label">PRINT</span>
                <div id="result" class="rl-ticket is-idle">
                    <div class="rl-ticket__slot" aria-hidden="true"></div>
                    <article class="rl-ticket__paper" aria-live="polite">
                        <div class="rl-ticket__head"><span id="result-time">LR-01 · --:--</span><span id="result-no">NO.--</span></div>
                        <p id="result-kicker" class="rl-ticket__kicker">STANDBY</p>
                        <p id="result-name" class="rl-ticket__name">—</p>
                        <p id="result-meta" class="rl-ticket__meta">후보 추가 → ▶ SPIN</p>
                        <p id="result-hours" class="rl-ticket__sub">&nbsp;</p>
                        <p id="result-menu" class="rl-ticket__sub" hidden></p>
                        <div id="result-pick" class="rl-ticket__pick" hidden>
                            <span class="rl-well"><button id="menu-pick" type="button" class="rl-key rl-key--beige rl-key--small">뭐 시키지?</button></span>
                            <span id="menu-picked" class="rl-ticket__picked" aria-live="polite"></span>
                        </div>
                        <p id="result-address" class="rl-ticket__sub">&nbsp;</p>
                        <div class="rl-ticket__cut" aria-hidden="true"></div>
                        <div class="rl-ticket__actions rl-well">
                            <a id="result-route" target="_blank" rel="noopener" class="rl-key rl-key--amber rl-key--small" aria-disabled="true" tabindex="-1">길찾기</a>
                            <a id="result-link" target="_blank" rel="noopener" class="rl-key rl-key--beige rl-key--small" aria-disabled="true" tabindex="-1">상세</a>
                            <button id="result-exclude" type="button" class="rl-key rl-key--beige rl-key--small" disabled>제외 후 재실행</button>
                            <button id="result-never" type="button" class="rl-key rl-key--beige rl-key--small" disabled title="앞으로 자동 채움·지도에서 뺌 (SIDE B 에서 해제)">다시 안 감</button>
                            <button id="result-again" type="button" class="rl-key rl-key--beige rl-key--small" disabled>재실행</button>
                        </div>
                        <div class="rl-ticket__share rl-well">
                            <button id="share-text" type="button" class="rl-key rl-key--beige rl-key--small" disabled title="슬랙·카톡에 붙여 넣을 글로 복사 (휴대폰은 공유 창)">공유</button>
                            <button id="share-image" type="button" class="rl-key rl-key--beige rl-key--small" disabled title="이 영수증을 이미지로 저장">이미지 저장</button>
                        </div>
                        {{-- 천공 카드 느낌의 구멍 두 줄: 당첨 가게 ID·시각·거리로 무늬를 정함 (장식) --}}
                        <div id="result-punch" class="rl-ticket__punch" aria-hidden="true"></div>
                    </article>
                </div>

                <div class="rl-log" aria-labelledby="log-title">
                    <span id="log-title" class="rl-console__label">LOG · TODAY</span>
                    {{-- 작은 CRT 단말: 형광 글자 + 주사선, 맨 아래 깜빡이는 프롬프트 --}}
                    <div class="rl-crt rl-log__screen">
                        <ol id="result-log" class="rl-log__list"></ol>
                        <p class="rl-log__prompt" aria-hidden="true">LOG&gt;<span class="rl-log__cursor"></span></p>
                    </div>
                </div>
            </div>
        </main>

        {{-- 명판 --}}
        <footer class="rl-plate rl-ribs">
            <div class="rl-grille" aria-hidden="true"></div>
            <div class="rl-ticks" aria-hidden="true"></div>
            <span class="rl-label" aria-hidden="true">LR-01 · LUNCH ROULETTE</span>
            <nav class="rl-plate__licenses" aria-label="라이선스">
                <a href="/fonts/Mulmaru-OFL.txt">FONT OFL</a>
                <a href="/fonts/DSEG-OFL.txt">DSEG OFL</a>
                <a href="/fonts/Orbitron-OFL.txt">ORBITRON OFL</a>
                <a href="/licenses/pixelarticons-LICENSE.txt">ICON MIT</a>
            </nav>
        </footer>
    </div>
</body>
</html>
