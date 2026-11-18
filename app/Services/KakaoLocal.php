<?php

namespace App\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * 카카오 로컬 API: 좌표 반경 안의 음식점(카테고리 FD6) 검색.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category
 */
class KakaoLocal
{
    private const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/category.json';

    private const CATEGORY_RESTAURANT = 'FD6';

    private const PAGE_SIZE = 15; // API 최대값

    private const MAX_PAGES = 3;  // API 가 페이지를 최대 45곳까지만 제공 (가까운 순)

    public function __construct(private readonly string $restApiKey) {}

    /**
     * @return list<array{id: string, name: string, category: string, distance: int, address: string, phone: string, url: string, lat: float, lng: float}>
     *
     * @throws RequestException
     */
    public function nearbyRestaurants(float $lat, float $lng, int $radius): array
    {
        // 약 11m 단위로 반올림해 같은 자리 재검색은 캐시로 처리
        $key = sprintf('kakao:fd6:%.4f:%.4f:%d', $lat, $lng, $radius);

        return Cache::remember($key, now()->addMinutes(10), function () use ($lat, $lng, $radius) {
            $places = [];

            for ($page = 1; $page <= self::MAX_PAGES; $page++) {
                $response = Http::withHeaders(['Authorization' => 'KakaoAK '.$this->restApiKey])
                    ->timeout(5)
                    ->get(self::ENDPOINT, [
                        'category_group_code' => self::CATEGORY_RESTAURANT,
                        'x' => $lng,
                        'y' => $lat,
                        'radius' => $radius,
                        'sort' => 'distance',
                        'size' => self::PAGE_SIZE,
                        'page' => $page,
                    ])
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
     * @param  array<string, mixed>  $doc
     * @return array{id: string, name: string, category: string, distance: int, address: string, phone: string, url: string, lat: float, lng: float}
     */
    private function toPlace(array $doc): array
    {
        // "음식점 > 한식 > 해장국" → "해장국"
        $category = trim((string) str($doc['category_name'] ?? '')->afterLast('>'));

        return [
            'id' => (string) $doc['id'],
            'name' => (string) $doc['place_name'],
            'category' => $category,
            'distance' => (int) ($doc['distance'] ?? 0),
            'address' => (string) (($doc['road_address_name'] ?? '') ?: ($doc['address_name'] ?? '')),
            'phone' => (string) ($doc['phone'] ?? ''),
            'url' => (string) ($doc['place_url'] ?? ''),
            'lat' => (float) $doc['y'],
            'lng' => (float) $doc['x'],
        ];
    }
}
