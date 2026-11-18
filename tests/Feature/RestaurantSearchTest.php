<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RestaurantSearchTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.kakao.rest_api_key' => 'test-rest-key']);
    }

    private function kakaoDocument(string $id, string $name, int $distance): array
    {
        return [
            'id' => $id,
            'place_name' => $name,
            'category_name' => '음식점 > 한식 > 국밥',
            'distance' => (string) $distance,
            'road_address_name' => '서울 중구 세종대로 110',
            'address_name' => '서울 중구 태평로1가 31',
            'phone' => '02-000-0000',
            'place_url' => "http://place.map.kakao.com/{$id}",
            'x' => '126.978',
            'y' => '37.5665',
        ];
    }

    public function test_home_page_renders_roulette(): void
    {
        $this->get(route('home'))
            ->assertOk()
            ->assertSee('점심 룰렛')
            ->assertSee(route('restaurants.index'), false);
    }

    public function test_returns_nearby_restaurants_mapped_from_kakao(): void
    {
        Http::fake([
            'dapi.kakao.com/*' => Http::response([
                'meta' => ['is_end' => true, 'total_count' => 1],
                'documents' => [$this->kakaoDocument('123', '광화문국밥', 357)],
            ]),
        ]);

        $this->getJson(route('restaurants.index', ['lat' => 37.5665, 'lng' => 126.978, 'radius' => 500]))
            ->assertOk()
            ->assertExactJson(['places' => [[
                'id' => '123',
                'name' => '광화문국밥',
                'category' => '국밥',
                'distance' => 357,
                'address' => '서울 중구 세종대로 110',
                'phone' => '02-000-0000',
                'url' => 'http://place.map.kakao.com/123',
                'lat' => 37.5665,
                'lng' => 126.978,
            ]]]);

        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'KakaoAK test-rest-key')
            && $request['category_group_code'] === 'FD6'
            && (int) $request['radius'] === 500
            && $request['sort'] === 'distance');
    }

    public function test_follows_pages_until_kakao_reports_end(): void
    {
        Http::fakeSequence('dapi.kakao.com/*')
            ->push(['meta' => ['is_end' => false], 'documents' => [$this->kakaoDocument('1', 'A', 10)]])
            ->push(['meta' => ['is_end' => true], 'documents' => [$this->kakaoDocument('2', 'B', 20)]]);

        $this->getJson(route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 300]))
            ->assertOk()
            ->assertJsonCount(2, 'places');

        Http::assertSentCount(2);
    }

    public function test_caches_results_for_the_same_spot(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response(['meta' => ['is_end' => true], 'documents' => []])]);

        $params = ['lat' => 37.4, 'lng' => 127.1, 'radius' => 1000];
        $this->getJson(route('restaurants.index', $params))->assertOk();
        $this->getJson(route('restaurants.index', $params))->assertOk();

        Http::assertSentCount(1);
    }

    public function test_rejects_invalid_coordinates_and_radius(): void
    {
        Http::fake();

        $this->getJson(route('restaurants.index', ['lat' => 51.5, 'lng' => -0.12, 'radius' => 777]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['lat', 'lng', 'radius']);

        Http::assertNothingSent();
    }

    public function test_returns_bad_gateway_when_kakao_fails(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response(['message' => 'unauthorized'], 401)]);

        $this->getJson(route('restaurants.index', ['lat' => 37.3, 'lng' => 127.2, 'radius' => 500]))
            ->assertStatus(502)
            ->assertJsonStructure(['message']);
    }
}
