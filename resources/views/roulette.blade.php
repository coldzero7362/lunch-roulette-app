<!DOCTYPE html>
<html lang="ko" class="h-full">
<head>
    @include('partials.head', ['title' => '점심 룰렛'])
    @vite('resources/js/roulette.js')
    <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={{ config('services.kakao.js_key') }}&autoload=false"></script>
</head>
<body class="min-h-full bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
    <div
        id="roulette-app"
        data-restaurants-url="{{ route('restaurants.index') }}"
        class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10"
    >
        <header class="flex items-center justify-between">
            <h1 class="text-xl font-semibold tracking-tight">🍽️ 점심 룰렛</h1>
            <nav class="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                @auth
                    <a href="{{ route('dashboard') }}" class="hover:text-zinc-900 dark:hover:text-white">대시보드</a>
                @else
                    <a href="{{ route('login') }}" class="hover:text-zinc-900 dark:hover:text-white">로그인</a>
                @endauth
            </nav>
        </header>

        <main class="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {{-- 지도 --}}
            <section class="flex flex-col gap-3" aria-label="지도">
                <div class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    <div id="map" class="h-[42vh] min-h-72 w-full lg:h-[560px]"></div>
                    <button
                        id="locate"
                        type="button"
                        class="absolute right-3 bottom-3 z-10 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    >📍 내 위치</button>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900" role="group" aria-label="검색 반경">
                        @foreach (\App\Http\Controllers\RestaurantController::RADII as $radius)
                            <button
                                type="button"
                                data-radius="{{ $radius }}"
                                aria-pressed="{{ $radius === 500 ? 'true' : 'false' }}"
                                class="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-400 dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
                            >{{ $radius >= 1000 ? ($radius / 1000).'km' : $radius.'m' }}</button>
                        @endforeach
                    </div>
                    <p id="status" class="text-sm text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">지도를 불러오는 중…</p>
                </div>
            </section>

            {{-- 룰렛 --}}
            <section class="flex flex-col items-center gap-5" aria-label="룰렛">
                <div class="relative w-full max-w-[360px]">
                    {{-- 바늘 --}}
                    <div class="absolute top-[-6px] left-1/2 z-10 -translate-x-1/2 drop-shadow" aria-hidden="true">
                        <svg width="28" height="34" viewBox="0 0 28 34"><path d="M14 34 L2 6 Q14 -4 26 6 Z" class="fill-zinc-900 dark:fill-white"/></svg>
                    </div>
                    <svg id="wheel" viewBox="-100 -100 200 200" class="aspect-square w-full" role="img" aria-label="룰렛 돌림판">
                        <g id="wheel-rotor"></g>
                        <circle r="13" class="fill-white stroke-zinc-900 dark:fill-zinc-900 dark:stroke-white" stroke-width="3"/>
                    </svg>
                </div>

                <button
                    id="spin"
                    type="button"
                    disabled
                    class="w-full max-w-[360px] rounded-xl bg-zinc-900 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >돌리기</button>

                {{-- 결과 --}}
                <div id="result" hidden class="w-full max-w-[360px] rounded-2xl border-2 border-zinc-900 bg-white p-5 dark:border-white dark:bg-zinc-900">
                    <p class="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">오늘 점심은</p>
                    <p id="result-name" class="mt-1 text-2xl font-bold tracking-tight"></p>
                    <p id="result-meta" class="mt-1 text-sm text-zinc-500 dark:text-zinc-400"></p>
                    <p id="result-address" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400"></p>
                    <div class="mt-4 flex flex-wrap gap-2">
                        <a id="result-link" href="#" target="_blank" rel="noopener" class="rounded-lg bg-yellow-300 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-yellow-400">카카오맵에서 보기 ↗</a>
                        <button id="result-exclude" type="button" class="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">여기 빼고 다시</button>
                    </div>
                </div>

                {{-- 후보 --}}
                <div class="w-full max-w-[360px]">
                    <div class="mb-2 flex items-center justify-between">
                        <h2 class="text-sm font-semibold">후보 <span id="candidate-count" class="font-normal text-zinc-500 dark:text-zinc-400"></span></h2>
                        <button id="shuffle" type="button" class="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white" disabled>🔀 후보 섞기</button>
                    </div>
                    <ul id="candidates" class="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"></ul>
                </div>
            </section>
        </main>
    </div>
</body>
</html>
