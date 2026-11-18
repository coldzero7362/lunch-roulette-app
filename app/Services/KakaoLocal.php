<?php

namespace App\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * 카카오 로컬 API로 좌표 반경 안의 음식점(카테고리 FD6)을 찾는다.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide
 *
 * @phpstan-type Place array{id: string, name: string, type: string, category: string, distance: int, address: string, phone: string, url: string, lat: float, lng: float}
 */
class KakaoLocal
{
    /** 종류 필터로 고를 수 있는 값 = 카카오 분류의 두 번째 칸 ("음식점 > 한식 > 국밥") */
    public const TYPES = ['한식', '중식', '일식', '양식', '분식', '술집'];

    /** '전체'에서 빼는 종류 (점심 후보로 맞지 않음) */
    private const EXCLUDED_FROM_ALL = ['간식'];

    private const CATEGORY_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/category.json';

    private const KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

    private const CATEGORY_RESTAURANT = 'FD6';

    private const PAGE_SIZE = 15; // API 최대값

    private const MAX_PAGES = 3;  // API 가 검색당 최대 45곳까지만 제공 (가까운 순)

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
        if ($types === []) {
            $places = $this->fetchAll(self::CATEGORY_ENDPOINT, $this->area($lat, $lng, $radius));

            return array_values(array_filter($places, fn (array $p) => ! in_array($p['type'], self::EXCLUDED_FROM_ALL, true)));
        }

        $merged = [];
        foreach (array_unique($types) as $type) {
            $found = $this->fetchAll(self::KEYWORD_ENDPOINT, $this->area($lat, $lng, $radius) + ['query' => $type]);

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
                $response = Http::withHeaders(['Authorization' => 'KakaoAK '.$this->restApiKey])
                    ->timeout(5)
                    ->get($endpoint, $params + ['page' => $page])
                    ->throw();

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
