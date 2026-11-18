<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * 카카오 로컬 API로 좌표 반경 안의 음식점(카테고리 FD6)을 찾는다.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide
 *
 * @phpstan-type Place array{id: string, name: string, type: string, category: string, distance: int, address: string, phone: string, url: string, lat: float, lng: float}
 * @phpstan-type Location array{name: string, address: string, kind: string, lat: float, lng: float}
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

    private const CATEGORY_RESTAURANT = 'FD6';

    private const PAGE_SIZE = 15; // API 최대값

    private const MAX_PAGES = 3;  // API 가 검색당 최대 45곳까지만 제공 (가까운 순)

    /**
     * 반경 → 격자 칸 수(한 변). 검색 한 번이 45곳까지라 식당이 빽빽하면 중심 100~200m 안 45곳만 온다.
     * 반경을 감싸는 사각형을 칸으로 나눠 칸마다 검색해야 반경 전체가 고르게 채워진다.
     */
    private const GRID = [300 => 2, 500 => 3, 1000 => 4];

    private const METERS_PER_DEGREE = 111_320;

    public function __construct(private readonly string $restApiKey) {}

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
     * @return list<Place>
     *
     * @throws RequestException
     */
    public function searchRestaurants(string $query, float $lat, float $lng, int $radius): array
    {
        return $this->fetchAll(self::KEYWORD_ENDPOINT, $this->area($lat, $lng, $radius) + ['query' => $query]);
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

        return [
            'id' => (string) $doc['id'],
            'name' => (string) $doc['place_name'],
            'type' => $parts[1] ?? '',
            'category' => (string) end($parts),
            'distance' => (int) ($doc['distance'] ?? 0),
            'address' => (string) (($doc['road_address_name'] ?? '') ?: ($doc['address_name'] ?? '')),
            'phone' => (string) ($doc['phone'] ?? ''),
            'url' => (string) ($doc['place_url'] ?? ''),
            'lat' => (float) $doc['y'],
            'lng' => (float) $doc['x'],
        ];
    }
}
