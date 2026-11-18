<!DOCTYPE html>
<html lang="ko">
<head>
    @include('partials.head', ['title' => '점심 룰렛'])
    @vite(['resources/css/roulette.css', 'resources/js/roulette.js'])
    <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={{ config('services.kakao.js_key') }}&autoload=false"></script>
</head>
<body class="rl-body">
    <div id="roulette-app" data-restaurants-url="{{ route('restaurants.index') }}" data-search-url="{{ route('restaurants.search') }}" class="rl-device">

        {{-- 머리 패널 --}}
        <header class="rl-head rl-ribs">
            <div>
                <h1 class="rl-title">점심 룰렛</h1>
                <span class="rl-model">MODEL LR-01 · LUNCH ROULETTE</span>
            </div>
        </header>
        <div class="rl-stripes" aria-hidden="true"></div>

        <main class="grid gap-8 p-4 sm:p-6 lg:grid-cols-[1.15fr_1fr] lg:grid-rows-[auto_auto_1fr] lg:p-8">

            {{-- 상태 표시 CRT: 맨 위 가로 전체 --}}
            <p class="rl-crt rl-crt--readout lg:col-span-2"><span id="status" role="status" aria-live="polite">지도를 불러오는 중이에요</span><span class="rl-caret" aria-hidden="true">_</span></p>

            {{-- 지도 --}}
            <section class="flex flex-col gap-4 lg:col-start-1 lg:row-start-2" aria-label="지도">
                <div class="rl-bezel rl-ribs">
                    <span class="rl-screw tl" aria-hidden="true"></span>
                    <span class="rl-screw tr" aria-hidden="true"></span>
                    <span class="rl-screw bl" aria-hidden="true"></span>
                    <span class="rl-screw br" aria-hidden="true"></span>
                    <div id="map-screen" class="rl-map is-crt">
                        <div id="map" class="h-[40vh] min-h-72 w-full lg:h-[500px]"></div>
                        {{-- CRT 효과 층: 클릭은 지도로 통과 --}}
                        <div class="rl-crt-fx" aria-hidden="true"></div>
                    </div>
                    <button id="locate" type="button" class="rl-key rl-key--icon" aria-label="내 위치로 이동" title="내 위치">
                        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true">
                            <circle cx="13" cy="13" r="7.5"/>
                            <circle cx="13" cy="13" r="2.4" fill="currentColor" stroke="none"/>
                            <path d="M13 1.5v5M13 19.5v5M1.5 13h5M19.5 13h5" stroke-linecap="square"/>
                        </svg>
                    </button>
                </div>

                <div class="flex flex-wrap items-end gap-4">
                    <div class="rl-bank" role="group" aria-label="검색 반경">
                        <div class="rl-bank__slot">
                            @foreach (\App\Http\Controllers\RestaurantController::RADII as $radius)
                                <button
                                    type="button"
                                    class="rl-bank__key"
                                    data-radius="{{ $radius }}"
                                    aria-pressed="{{ $radius === 500 ? 'true' : 'false' }}"
                                >{{ $radius >= 1000 ? ($radius / 1000).'km' : $radius.'m' }}</button>
                            @endforeach
                        </div>
                        <span class="rl-label">RANGE · 반경</span>
                    </div>
                    <div class="rl-bank">
                        <div class="rl-bank__slot">
                            <button id="crt-toggle" type="button" class="rl-bank__key" aria-pressed="true">CRT</button>
                        </div>
                        <span class="rl-label">SCREEN · 효과</span>
                    </div>
                </div>

                {{-- 종류: 여러 개 고를 수 있음. 아무것도 안 고르면 전체 --}}
                <div class="rl-bank rl-bank--wide" role="group" aria-label="음식 종류">
                    <div class="rl-bank__slot">
                        <button type="button" class="rl-bank__key" data-type="" aria-pressed="true">전체</button>
                        @foreach (\App\Services\KakaoLocal::TYPES as $type)
                            <button type="button" class="rl-bank__key" data-type="{{ $type }}" aria-pressed="false">{{ $type === '술집' ? '주점' : $type }}</button>
                        @endforeach
                    </div>
                    <span class="rl-label">MENU TYPE · 종류</span>
                </div>

            </section>

            {{-- 룰렛 --}}
            <section class="flex flex-col items-center gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-2" aria-label="룰렛">
                <div class="rl-deck rl-ribs">
                    <span class="rl-screw tl" aria-hidden="true"></span>
                    <span class="rl-screw tr" aria-hidden="true"></span>
                    <span class="rl-screw bl" aria-hidden="true"></span>
                    <span class="rl-screw br" aria-hidden="true"></span>

                    <div class="rl-window">
                        <svg class="rl-pointer" width="30" height="36" viewBox="0 0 30 36" aria-hidden="true">
                            <path d="M15 34 L3 8 L3 3 L27 3 L27 8 Z" fill="#d25a22" stroke="#2b2620" stroke-width="2.5" stroke-linejoin="round"/>
                        </svg>
                        <svg id="wheel" viewBox="-100 -100 200 200" class="block aspect-square w-full" role="img" aria-label="룰렛 돌림판">
                            <g id="wheel-rotor"></g>
                            <circle r="98.5" fill="none" stroke="#2b2620" stroke-width="3"/>
                        </svg>
                    </div>

                    <div class="mt-6">
                        <button id="spin" type="button" disabled class="rl-key rl-key--wide">▶ 돌리기</button>
                    </div>
                </div>

                {{-- 결과 --}}
                <div id="result" hidden class="rl-result">
                    <div class="rl-crt rl-result__screen" aria-live="polite">
                        <p class="rl-result__kicker dim">오늘 점심은</p>
                        <p id="result-name" class="rl-result__name amber"></p>
                        <p id="result-meta" class="rl-result__meta"></p>
                        <p id="result-address" class="rl-result__meta dim"></p>
                    </div>
                    <div class="rl-result__actions">
                        <a id="result-link" href="#" target="_blank" rel="noopener" class="rl-key rl-key--amber rl-key--small">카카오맵에서 보기 ↗</a>
                        <button id="result-exclude" type="button" class="rl-key rl-key--beige rl-key--small">여기 빼고 다시</button>
                    </div>
                </div>

                {{-- 후보 (카세트 라벨) --}}
                <div class="rl-jcard">
                    <div class="rl-stripes" style="height:8px;border-top:0" aria-hidden="true"></div>
                    <div class="rl-jcard__head">
                        <h2 class="rl-jcard__title">SIDE A · 후보 <span id="candidate-count" class="rl-jcard__count"></span></h2>
                        <button id="shuffle" type="button" class="rl-key rl-key--beige rl-key--small" disabled>섞기</button>
                    </div>
                    <ul id="candidates" class="m-0 list-none p-0"></ul>
                </div>
            </section>

            {{-- 메뉴 찾기 → 후보에 넣기 (모바일: 룰렛 아래, 데스크톱: 지도 아래) --}}
            <section class="lg:col-start-1 lg:row-start-3" aria-label="메뉴 찾기">
                    <div class="rl-jcard rl-jcard--full">
                        <div class="rl-stripes" style="height:8px;border-top:0" aria-hidden="true"></div>
                        <div class="rl-jcard__head">
                            <h2 class="rl-jcard__title">SIDE B · 메뉴 찾기</h2>
                        </div>
                        <form id="search-form" class="rl-search" role="search">
                            <label for="search-input" class="sr-only">메뉴나 가게 이름</label>
                            <input id="search-input" type="search" class="rl-search__input" placeholder="짬뽕, 제육, 쌀국수…" maxlength="30" autocomplete="off" enterkeyhint="search">
                            <button type="submit" class="rl-key rl-key--small">찾기</button>
                        </form>
                        <p id="search-status" class="rl-track__empty" aria-live="polite">메뉴를 찾아서 후보에 넣어 보세요</p>
                        <ul id="search-results" class="rl-search__results m-0 list-none p-0"></ul>
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
