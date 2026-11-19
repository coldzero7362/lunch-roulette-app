<!DOCTYPE html>
<html lang="ko">
<head>
    @include('partials.head', ['title' => '점심 룰렛'])
    @vite(['resources/css/roulette.css', 'resources/js/roulette.js'])
    <script nonce="{{ Vite::cspNonce() }}" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={{ config('services.kakao.js_key') }}&autoload=false&libraries=clusterer"></script>
</head>
<body class="rl-body">
    <div id="roulette-app" data-restaurants-url="{{ route('restaurants.index') }}" data-search-url="{{ route('restaurants.search') }}" data-locations-url="{{ route('locations.search') }}" class="rl-device">

        {{-- 머리 패널: 단계 표시등 --}}
        <header class="rl-head rl-ribs">
            <div>
                <h1 class="rl-title">점심 룰렛</h1>
                <span class="rl-model">MODEL LR-01 · LUNCH ROULETTE</span>
            </div>
            <ol id="steps" class="rl-steps" aria-label="진행 단계">
                <li data-step="loc"><span class="rl-steps__lamp" aria-hidden="true"></span>01 위치</li>
                <li data-step="cond"><span class="rl-steps__lamp" aria-hidden="true"></span>02 조건</li>
                <li data-step="cand"><span class="rl-steps__lamp" aria-hidden="true"></span>03 후보</li>
                <li data-step="spin"><span class="rl-steps__lamp" aria-hidden="true"></span>04 돌리기</li>
            </ol>
        </header>
        <div class="rl-stripes" aria-hidden="true"></div>

        {{-- 상태 CRT: 칸별 값 + 시스템 메시지 --}}
        <div class="rl-readout rl-crt">
            <dl class="rl-readout__fields">
                <div><dt>LOC</dt><dd id="f-loc">—</dd></div>
                <div><dt>RANGE</dt><dd id="f-range">500m</dd></div>
                <div><dt>TYPE</dt><dd id="f-type">전체</dd></div>
                <div><dt>FOUND</dt><dd id="f-found">—</dd></div>
                <div><dt>WHEEL</dt><dd id="f-wheel" class="amber">0/8</dd></div>
            </dl>
            <p class="rl-readout__msg"><span class="dim" aria-hidden="true">SYS&gt;</span> <span id="status" role="status" aria-live="polite">BOOT</span><span class="rl-caret" aria-hidden="true">_</span></p>
        </div>

        <main class="rl-main">

            {{-- 01 위치 · 02 조건: 한 장비 --}}
            <section class="rl-console rl-ribs" aria-label="위치와 조건">
                <span class="rl-screw tl" aria-hidden="true"></span>
                <span class="rl-screw tr" aria-hidden="true"></span>
                <span class="rl-screw bl" aria-hidden="true"></span>
                <span class="rl-screw br" aria-hidden="true"></span>

                <div class="rl-locate">
                    <form id="loc-form" class="rl-locate__bar" role="search">
                        <label for="loc-input" class="rl-console__label">01 LOC</label>
                        <input id="loc-input" type="search" class="rl-search__input" placeholder="역 · 건물 · 도로명 주소" maxlength="50" autocomplete="off" enterkeyhint="search">
                        <button type="submit" class="rl-key rl-key--beige rl-key--small">검색</button>
                        <button id="locate" type="button" class="rl-key rl-key--beige rl-key--square" aria-label="현재 위치 사용" title="현재 위치">
                            <svg width="20" height="20" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true">
                                <circle cx="13" cy="13" r="7.5"/>
                                <circle cx="13" cy="13" r="2.4" fill="currentColor" stroke="none"/>
                                <path d="M13 1.5v5M13 19.5v5M1.5 13h5M19.5 13h5" stroke-linecap="square"/>
                            </svg>
                        </button>
                    </form>
                    <ul id="loc-results" class="rl-locate__results" hidden></ul>
                </div>

                <div id="map-screen" class="rl-map is-crt">
                    <div id="map" class="rl-map__canvas"></div>
                    {{-- CRT 효과 층: 클릭은 지도로 통과 --}}
                    <div class="rl-crt-fx" aria-hidden="true"></div>
                </div>

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
                    <div class="rl-bank" role="group" aria-labelledby="lbl-fx">
                        <span id="lbl-fx" class="rl-console__label">FX</span>
                        <div class="rl-bank__slot">
                            <button id="crt-toggle" type="button" class="rl-bank__key" aria-pressed="true">CRT</button>
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
                        <svg class="rl-pointer" width="30" height="36" viewBox="0 0 30 36" aria-hidden="true">
                            <path d="M15 34 L3 8 L3 3 L27 3 L27 8 Z" fill="#d25a22" stroke="#2b2620" stroke-width="2.5" stroke-linejoin="round"/>
                        </svg>
                        <svg id="wheel" viewBox="-100 -100 200 200" class="rl-wheel" role="img" aria-label="돌림판. 칸 번호는 SIDE A 후보 번호와 같음">
                            <g id="wheel-rotor"></g>
                            <circle r="98.5" fill="none" stroke="#2b2620" stroke-width="3"/>
                        </svg>
                    </div>

                    <div class="rl-deck__controls">
                        <span class="rl-console__label">04 SPIN</span>
                        <button id="spin" type="button" disabled class="rl-key rl-key--wide">▶ 돌리기</button>
                        <p class="rl-deck__hint">칸 번호 = 후보 번호. 바늘 위치 = 결과.</p>
                    </div>
                </div>

                {{-- 결과 티켓 --}}
                <div id="result" hidden class="rl-ticket">
                    <div class="rl-ticket__slot" aria-hidden="true"></div>
                    <article class="rl-ticket__paper" aria-live="polite">
                        <div class="rl-ticket__head"><span id="result-time">LR-01</span><span id="result-no">NO.01</span></div>
                        <p class="rl-ticket__kicker">RESULT</p>
                        <p id="result-name" class="rl-ticket__name"></p>
                        <p id="result-meta" class="rl-ticket__meta"></p>
                        <p id="result-address" class="rl-ticket__sub"></p>
                        <div class="rl-ticket__cut" aria-hidden="true"></div>
                        <div class="rl-ticket__actions">
                            <a id="result-route" href="#" target="_blank" rel="noopener" class="rl-key rl-key--amber rl-key--small">길찾기</a>
                            <a id="result-link" href="#" target="_blank" rel="noopener" class="rl-key rl-key--beige rl-key--small">상세</a>
                            <button id="result-exclude" type="button" class="rl-key rl-key--beige rl-key--small">제외 후 재실행</button>
                            <button id="result-again" type="button" class="rl-key rl-key--beige rl-key--small">재실행</button>
                        </div>
                    </article>
                </div>

                <div class="rl-log" aria-labelledby="log-title">
                    <span id="log-title" class="rl-console__label">LOG · 오늘</span>
                    <ol id="result-log" class="rl-log__list"></ol>
                </div>

                {{-- 03 후보: 카세트 A면 / B면 --}}
                <div class="rl-jcard rl-jcard--full">
                    <div class="rl-stripes" style="height:8px;border-top:0" aria-hidden="true"></div>
                    <div class="rl-tabs" role="tablist" aria-label="03 후보">
                        <button id="tab-a" type="button" role="tab" class="rl-tabs__tab" aria-selected="true" aria-controls="panel-a">SIDE A · 후보 <span id="candidate-count" class="rl-jcard__count">0/8</span></button>
                        <button id="tab-b" type="button" role="tab" class="rl-tabs__tab" aria-selected="false" aria-controls="panel-b" tabindex="-1">SIDE B · 메뉴 검색</button>
                    </div>

                    <div id="panel-a" role="tabpanel" aria-labelledby="tab-a">
                        <div class="rl-jcard__tools">
                            <button id="auto" type="button" class="rl-key rl-key--beige rl-key--small" disabled>자동 채움</button>
                            <button id="shuffle" type="button" class="rl-key rl-key--beige rl-key--small" disabled>섞기</button>
                            <button id="clear" type="button" class="rl-key rl-key--beige rl-key--small" disabled>비움</button>
                            <div class="rl-stepper" role="group" aria-label="후보 수">
                                <button id="slots-down" type="button" class="rl-key rl-key--beige rl-key--tiny" aria-label="후보 수 감소">−</button>
                                <output id="slots" class="rl-counter" aria-live="polite">08</output>
                                <button id="slots-up" type="button" class="rl-key rl-key--beige rl-key--tiny" aria-label="후보 수 증가">+</button>
                            </div>
                        </div>
                        <ul id="candidates" class="m-0 list-none p-0"></ul>
                    </div>

                    <div id="panel-b" role="tabpanel" aria-labelledby="tab-b" hidden>
                        <form id="search-form" class="rl-search" role="search">
                            <label for="search-input" class="sr-only">메뉴 또는 가게 이름</label>
                            <input id="search-input" type="search" class="rl-search__input" placeholder="메뉴 · 가게 이름" maxlength="30" autocomplete="off" enterkeyhint="search">
                            <button type="submit" class="rl-key rl-key--beige rl-key--small">검색</button>
                        </form>
                        <p id="search-status" class="rl-track__empty" aria-live="polite">반경 내 메뉴 검색 → [+]로 후보 추가</p>
                        <ul id="search-results" class="rl-search__results m-0 list-none p-0"></ul>
                    </div>
                </div>
            </section>
        </main>

        {{-- 명판 --}}
        <footer class="rl-plate rl-ribs" aria-hidden="true">
            <div class="rl-grille"></div>
            <div class="rl-ticks"></div>
            <span class="rl-label">LR-01 · 점심 룰렛</span>
        </footer>
    </div>
</body>
</html>
