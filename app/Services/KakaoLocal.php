<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

/**
 * 카카오 로컬 API로 좌표 반경 안의 음식점(카테고리 FD6)을 찾는다.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide
 *
 * @phpstan-type Place array{id: string, name: string, type: string, category: string, tags: list<string>, distance: int, address: string, phone: string, url: string, lat: float, lng: float}
 * @phpstan-type RankedPlace array{id: string, name: string, type: string, category: string, tags: list<string>, distance: int, address: string, phone: string, url: string, lat: float, lng: float, match: string}
 * @phpstan-type Location array{name: string, address: string, kind: string, lat: float, lng: float}
 * @phpstan-type Hours array{status: 'open'|'break'|'closed'|'unknown', label: string, info: string, today: string}
 */
class KakaoLocal
{
    /** 종류 필터로 고를 수 있는 값 = 카카오 분류의 두 번째 칸 ("음식점 > 한식 > 국밥") */
    public const TYPES = ['한식', '중식', '일식', '양식', '분식', '술집'];

    /** '전체'에서 빼는 종류 (점심 후보로 맞지 않음) */
    private const EXCLUDED_FROM_ALL = ['간식'];

    private const CATEGORY_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/category.json';

    private const KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

    private const ADDRESS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json';

    /** 카카오맵 웹의 장소 상세 (비공식, 키 없음). 영업시간이 여기에만 있다 */
    private const PLACE_DETAIL_ENDPOINT = 'https://place-api.map.kakao.com/places/panel3/';

    /** @var Hours */
    private const UNKNOWN_HOURS = ['status' => 'unknown', 'label' => '', 'info' => '', 'today' => ''];

    private const CATEGORY_RESTAURANT = 'FD6';

    private const PAGE_SIZE = 15; // API 최대값

    private const MAX_PAGES = 3;  // API 가 검색당 최대 45곳까지만 제공 (가까운 순)

    /**
     * 반경 → 격자 칸 수(한 변). 검색 한 번이 45곳까지라 식당이 빽빽하면 중심 100~200m 안 45곳만 온다.
     * 반경을 감싸는 사각형을 칸으로 나눠 칸마다 검색해야 반경 전체가 고르게 채워진다.
     */
    private const GRID = [300 => 2, 500 => 3, 1000 => 4];

    private const METERS_PER_DEGREE = 111_320;

    public function __construct(
        private readonly string $restApiKey,
        private readonly int $minuteBudget = 600,
        private readonly int $dailyBudget = 50000,
        private readonly int $detailMinuteBudget = 300,
        private readonly int $detailDailyBudget = 20000,
    ) {}

    /**
     * 카카오 호출 $calls 번을 예산에서 뺀다. 남은 예산이 모자라면 아예 부르지 않는다.
     * (식당 검색 한 번이 칸·페이지·종류만큼 수십 번 호출하므로, 좌표를 바꿔 캐시를 피하는 폭주를 막는 마지막 둑)
     *
     * @throws KakaoBudgetExceeded
     */
    private function reserve(int $calls, bool $detail = false): void
    {
        // 영업시간(비공식 장소 상세)은 공식 로컬 API 와 예산을 따로 씀
        $windows = $detail ? [
            ['kakao:detail:minute', $this->detailMinuteBudget, 60],
            ['kakao:detail:day', $this->detailDailyBudget, 86400],
        ] : [
            ['kakao:budget:minute', $this->minuteBudget, 60],
            ['kakao:budget:day', $this->dailyBudget, 86400],
        ];

        foreach ($windows as [$key, $max]) {
            if (RateLimiter::attempts($key) + $calls > $max) {
                throw new KakaoBudgetExceeded("Kakao {$key} exhausted");
            }
        }

        foreach ($windows as [$key, , $decay]) {
            RateLimiter::increment($key, $decay, $calls);
        }
    }

    /**
     * 반경 안 식당. 종류를 고르면 종류마다 따로 검색해 합친다 (한 번 검색은 45곳이 한도라서).
     *
     * @param  list<string>  $types  self::TYPES 중에서. 비우면 전체
     * @return list<Place>
     *
     * @throws RequestException
     */
    public function nearbyRestaurants(float $lat, float $lng, int $radius, array $types = []): array
    {
        $grid = $this->gridSize($radius);

        if ($types === []) {
            $places = $this->fetchTiled(self::CATEGORY_ENDPOINT, $lat, $lng, $radius, $grid);

            return array_values(array_filter($places, fn (array $p) => ! in_array($p['type'], self::EXCLUDED_FROM_ALL, true)));
        }

        // 종류별로 따로 검색하므로 격자는 한 단계 작게 (요청 수 절약)
        $grid = max(1, $grid - 1);
        $merged = [];
        foreach (array_unique($types) as $type) {
            $found = $this->fetchTiled(self::KEYWORD_ENDPOINT, $lat, $lng, $radius, $grid, ['query' => $type]);

            // 키워드 검색은 다른 종류도 조금 섞여 나온다 (예: '일식' → 일본식 주점)
            foreach ($found as $place) {
                if ($place['type'] === $type) {
                    $merged[$place['id']] = $place;
                }
            }
        }

        return $this->byDistance($merged);
    }

    /**
     * 메뉴·가게 이름으로 반경 안 식당 검색 (예: "짬뽕", "쌀국수").
     *
     * 카카오 키워드 검색은 메뉴 일부로만 걸린 곳(술집의 피자 안주 등)도 섞어 주므로
     * 분류 태그 기준으로 일치 등급을 매겨 정렬한다. 같은 등급 안에선 가까운 순.
     *   tag  : 분류 태그에 검색어가 있음 ("음식점 > 양식 > 피자")
     *   name : 가게 이름에 검색어가 있음
     *   menu : 메뉴 일부로만 걸림
     *   pub  : 주점이면서 태그·이름이 안 맞음 (안주로 파는 경우) → 맨 뒤
     *
     * @return list<RankedPlace>
     *
     * @throws RequestException
     */
    public function searchRestaurants(string $query, float $lat, float $lng, int $radius): array
    {
        $places = $this->fetchAll(self::KEYWORD_ENDPOINT, $this->area($lat, $lng, $radius) + ['query' => $query]);

        $q = $this->normalize($query);
        $order = ['tag' => 0, 'name' => 1, 'menu' => 2, 'pub' => 3];

        $ranked = array_map(fn (array $p) => $p + ['match' => $this->matchOf($p, $q)], $places);
        usort($ranked, fn (array $a, array $b) => [$order[$a['match']], $a['distance']] <=> [$order[$b['match']], $b['distance']]);

        return $ranked;
    }

    /** @param  Place  $place */
    private function matchOf(array $place, string $q): string
    {
        if ($q === '') {
            return 'menu';
        }

        foreach ($place['tags'] as $tag) {
            $t = $this->normalize($tag);
            // "피자" ↔ 태그 "피자", "수제피자" ↔ 태그 "피자" (두 글자 이상 태그만 거꾸로 포함 검사)
            if ($t !== '' && (str_contains($t, $q) || (mb_strlen($t) >= 2 && str_contains($q, $t)))) {
                return 'tag';
            }
        }

        if (str_contains($this->normalize($place['name']), $q)) {
            return 'name';
        }

        return $place['type'] === '술집' ? 'pub' : 'menu';
    }

    private function normalize(string $text): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', '', $text));
    }

    /**
     * 가게별 지금 영업 상태. 공식 로컬 API엔 영업시간이 없어서 카카오맵 웹이 쓰는 장소 상세(비공식)를 읽는다.
     * 문서가 없는 API라 언제든 막히거나 형식이 바뀔 수 있다: 실패한 가게는 'unknown' 으로 두고 예외를 던지지 않는다.
     * 상태가 시각에 따라 바뀌므로 짧게(10분) 캐시하고, 실패는 2분만 기억한다.
     *
     * @param  list<string>  $ids  카카오 장소 id
     * @return array<string, Hours>
     *
     * @throws KakaoBudgetExceeded
     */
    public function openHours(array $ids): array
    {
        $ids = array_values(array_unique($ids));
        $result = [];
        $missing = [];

        foreach ($ids as $id) {
            $cached = Cache::get('kakao:hours:'.$id);
            if (is_array($cached)) {
                /** @var Hours $cached */
                $result[$id] = $cached;
            } else {
                $missing[] = $id;
            }
        }

        if ($missing !== []) {
            $this->reserve(count($missing), detail: true);
            $responses = Http::pool(fn (Pool $pool) => array_map(
                fn (string $id) => $pool->as($id)
                    ->accept('application/json')
                    ->timeout(5)
                    ->get(self::PLACE_DETAIL_ENDPOINT.$id),
                $missing,
            ));

            foreach ($missing as $id) {
                $response = $responses[$id] ?? null;
                if (! $response instanceof Response || ! $response->successful() || ! is_array($response->json())) {
                    // 실패도 잠깐(2분) 기억: 막힌 동안 후보를 바꿀 때마다 같은 가게를 다시 두드리지 않게
                    Cache::put('kakao:hours:'.$id, self::UNKNOWN_HOURS, now()->addMinutes(2));
                    $result[$id] = self::UNKNOWN_HOURS;

                    continue;
                }

                $hours = $this->toHours($response->json('open_hours'));
                Cache::put('kakao:hours:'.$id, $hours, now()->addMinutes(10));
                $result[$id] = $hours;
            }
        }

        // 요청한 순서대로
        $ordered = [];
        foreach ($ids as $id) {
            $ordered[$id] = $result[$id];
        }

        return $ordered;
    }

    /**
     * 장소 상세의 open_hours → 우리 모양. headline.code 를 네 가지로 줄인다.
     *   OPEN → open, BREAK_TIME → break, BEFORE_OPEN·CLOSED·휴무 → closed, 정보 없음·모르는 코드 → unknown
     *
     * @return Hours
     */
    private function toHours(mixed $openHours): array
    {
        if (! is_array($openHours) || ! is_array($openHours['headline'] ?? null)) {
            return self::UNKNOWN_HOURS;
        }

        $headline = $openHours['headline'];
        $code = (string) ($headline['code'] ?? '');
        $status = match (true) {
            $code === 'OPEN' => 'open',
            $code === 'BREAK_TIME' => 'break',
            in_array($code, ['BEFORE_OPEN', 'CLOSED'], true), str_contains($code, 'HOLIDAY'), str_contains($code, 'OFF') => 'closed',
            default => 'unknown',
        };

        // 오늘(is_highlight) 영업시간 한 줄: "11:00 ~ 20:30 (브레이크 14:30 ~ 16:30)" 또는 "휴무일"
        $today = '';
        foreach ((array) ($openHours['week_from_today']['week_periods'] ?? []) as $period) {
            foreach ((array) ($period['days'] ?? []) as $day) {
                if (! ($day['is_highlight'] ?? false)) {
                    continue;
                }
                $today = (string) ($day['on_days']['start_end_time_desc'] ?? $day['off_days_desc'] ?? '');
                $breaks = array_map(
                    fn ($b) => trim(str_replace('브레이크타임', '', (string) $b)),
                    (array) ($day['on_days']['break_times_desc'] ?? []),
                );
                if ($breaks !== []) {
                    $today .= ' (브레이크 '.implode(', ', $breaks).')';
                }
                break 2;
            }
        }

        return [
            'status' => $status,
            'label' => mb_substr((string) ($headline['display_text'] ?? ''), 0, 20),
            'info' => mb_substr((string) ($headline['display_text_info'] ?? ''), 0, 30),
            'today' => mb_substr($today, 0, 60),
        ];
    }

    /**
     * 위치 정하기용 검색: 주소가 정확히 맞으면 맨 위, 그 아래 장소 이름 검색 결과 (역·건물·회사 등).
     *
     * @return list<Location>
     *
     * @throws RequestException
     */
    public function searchLocations(string $query): array
    {
        return Cache::remember('kakao:loc:'.md5($query), now()->addDay(), function () use ($query) {
            $addresses = $this->get(self::ADDRESS_ENDPOINT, ['query' => $query, 'size' => 3])->json('documents', []);
            $places = $this->get(self::KEYWORD_ENDPOINT, ['query' => $query, 'size' => 10])->json('documents', []);

            $results = [];
            foreach ($addresses as $doc) {
                $results[] = [
                    'name' => (string) $doc['address_name'],
                    'address' => (string) ($doc['road_address']['address_name'] ?? $doc['address']['address_name'] ?? ''),
                    'kind' => 'address',
                    'lat' => (float) $doc['y'],
                    'lng' => (float) $doc['x'],
                ];
            }
            foreach ($places as $doc) {
                $results[] = [
                    'name' => (string) $doc['place_name'],
                    'address' => (string) (($doc['road_address_name'] ?? '') ?: ($doc['address_name'] ?? '')),
                    'kind' => (string) ($doc['category_group_name'] ?? ''),
                    'lat' => (float) $doc['y'],
                    'lng' => (float) $doc['x'],
                ];
            }

            return $results;
        });
    }

    /**
     * @param  array<string, string|int|float>  $params
     *
     * @throws RequestException
     */
    private function get(string $endpoint, array $params): Response
    {
        $this->reserve(1);

        return Http::withHeaders(['Authorization' => 'KakaoAK '.$this->restApiKey])
            ->timeout(5)
            ->get($endpoint, $params)
            ->throw();
    }

    private function gridSize(int $radius): int
    {
        foreach (self::GRID as $max => $size) {
            if ($radius <= $max) {
                return $size;
            }
        }

        return max(self::GRID);
    }

    /**
     * 반경을 감싸는 사각형을 grid×grid 칸으로 나눠 칸마다(동시에) 검색하고, 반경 밖은 버린 뒤 가까운 순으로 합친다.
     *
     * @param  array<string, string>  $extra  예: ['query' => '한식']
     * @return list<Place>
     *
     * @throws RequestException|ConnectionException
     */
    private function fetchTiled(string $endpoint, float $lat, float $lng, int $radius, int $grid, array $extra = []): array
    {
        $lat = round($lat, 4); // 약 11m 단위: 같은 자리 재검색은 캐시로
        $lng = round($lng, 4);
        $key = 'kakao:tiled:'.md5(implode('|', [$endpoint, $lat, $lng, $radius, $grid, http_build_query($extra)]));

        return Cache::remember($key, now()->addMinutes(10), function () use ($endpoint, $lat, $lng, $radius, $grid, $extra) {
            $base = $extra + [
                'category_group_code' => self::CATEGORY_RESTAURANT,
                'x' => $lng, // 거리 계산 기준
                'y' => $lat,
                'size' => self::PAGE_SIZE,
            ];

            $pending = $this->tiles($lat, $lng, $radius, $grid);
            $places = [];

            for ($page = 1; $page <= self::MAX_PAGES && $pending !== []; $page++) {
                $this->reserve(count($pending));
                $responses = Http::pool(fn (Pool $pool) => array_map(
                    fn (string $rect) => $pool->as($rect)
                        ->withHeaders(['Authorization' => 'KakaoAK '.$this->restApiKey])
                        ->timeout(5)
                        ->get($endpoint, $base + ['rect' => $rect, 'page' => $page]),
                    $pending,
                ));

                $next = [];
                foreach ($responses as $rect => $response) {
                    if ($response instanceof \Throwable) {
                        throw $response;
                    }
                    $response->throw();

                    foreach ($response->json('documents', []) as $doc) {
                        $place = $this->toPlace($doc);
                        if ($place['distance'] <= $radius) { // 사각형 모서리는 반경 밖
                            $places[$place['id']] = $place;
                        }
                    }

                    if (! $response->json('meta.is_end', true)) {
                        $next[] = (string) $rect;
                    }
                }
                $pending = $next;
            }

            return $this->byDistance($places);
        });
    }

    /**
     * 반경을 감싸는 사각형을 grid×grid 칸으로 나눈 rect 목록 ("왼쪽X,아래Y,오른쪽X,위Y").
     *
     * @return list<string>
     */
    private function tiles(float $lat, float $lng, int $radius, int $grid): array
    {
        $dLat = $radius / self::METERS_PER_DEGREE;
        $dLng = $radius / (self::METERS_PER_DEGREE * cos(deg2rad($lat)));
        $stepLat = 2 * $dLat / $grid;
        $stepLng = 2 * $dLng / $grid;

        $rects = [];
        for ($row = 0; $row < $grid; $row++) {
            for ($col = 0; $col < $grid; $col++) {
                $x1 = $lng - $dLng + $col * $stepLng;
                $y1 = $lat - $dLat + $row * $stepLat;
                $rects[] = sprintf('%.6f,%.6f,%.6f,%.6f', $x1, $y1, $x1 + $stepLng, $y1 + $stepLat);
            }
        }

        return $rects;
    }

    /** @return array<string, string|int|float> */
    private function area(float $lat, float $lng, int $radius): array
    {
        return [
            'category_group_code' => self::CATEGORY_RESTAURANT,
            // 약 11m 단위로 반올림: 같은 자리 재검색은 캐시로
            'x' => round($lng, 4),
            'y' => round($lat, 4),
            'radius' => $radius,
            'sort' => 'distance',
            'size' => self::PAGE_SIZE,
        ];
    }

    /**
     * 마지막 페이지까지(최대 MAX_PAGES) 받아서 10분 캐시.
     *
     * @param  array<string, string|int|float>  $params
     * @return list<Place>
     */
    private function fetchAll(string $endpoint, array $params): array
    {
        $key = 'kakao:'.md5($endpoint.'?'.http_build_query($params));

        return Cache::remember($key, now()->addMinutes(10), function () use ($endpoint, $params) {
            $places = [];

            for ($page = 1; $page <= self::MAX_PAGES; $page++) {
                $response = $this->get($endpoint, $params + ['page' => $page]);

                foreach ($response->json('documents', []) as $doc) {
                    $places[] = $this->toPlace($doc);
                }

                if ($response->json('meta.is_end', true)) {
                    break;
                }
            }

            return $places;
        });
    }

    /**
     * @param  array<string, Place>  $places
     * @return list<Place>
     */
    private function byDistance(array $places): array
    {
        $list = array_values($places);
        usort($list, fn (array $a, array $b) => $a['distance'] <=> $b['distance']);

        return $list;
    }

    /**
     * @param  array<string, mixed>  $doc
     * @return Place
     */
    private function toPlace(array $doc): array
    {
        // "음식점 > 한식 > 해장국" → type 한식, category 해장국
        $parts = array_map('trim', explode('>', (string) ($doc['category_name'] ?? '')));
        // 태그: "음식점" 다음 칸들, 쉼표로 묶인 것도 낱개로 ("술집 > 호프,요리주점" → 술집, 호프, 요리주점)
        $tags = [];
        foreach (array_slice($parts, 1) as $part) {
            foreach (explode(',', $part) as $tag) {
                if (($tag = trim($tag)) !== '') {
                    $tags[] = $tag;
                }
            }
        }

        return [
            'id' => (string) $doc['id'],
            'name' => (string) $doc['place_name'],
            'type' => $parts[1] ?? '',
            'category' => (string) end($parts),
            'tags' => array_values(array_unique($tags)),
            'distance' => (int) ($doc['distance'] ?? 0),
            'address' => (string) (($doc['road_address_name'] ?? '') ?: ($doc['address_name'] ?? '')),
            'phone' => (string) ($doc['phone'] ?? ''),
            'url' => (string) ($doc['place_url'] ?? ''),
            'lat' => (float) $doc['y'],
            'lng' => (float) $doc['x'],
        ];
    }
}
