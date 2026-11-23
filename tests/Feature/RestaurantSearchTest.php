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

    private function kakaoDocument(string $id, string $name, int $distance, string $category = '음식점 > 한식 > 국밥'): array
    {
        return [
            'id' => $id,
            'place_name' => $name,
            'category_name' => $category,
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
                'type' => '한식',
                'category' => '국밥',
                'tags' => ['한식', '국밥'],
                'distance' => 357,
                'address' => '서울 중구 세종대로 110',
                'phone' => '02-000-0000',
                'url' => 'http://place.map.kakao.com/123',
                'lat' => 37.5665,
                'lng' => 126.978,
            ]]]);

        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'KakaoAK test-rest-key')
            && $request['category_group_code'] === 'FD6'
            && isset($request['rect']));
    }

    public function test_follows_pages_until_kakao_reports_end(): void
    {
        // 칸마다 1쪽은 '더 있음', 2쪽은 '끝'
        Http::fake(fn (Request $r) => Http::response([
            'meta' => ['is_end' => (int) $r['page'] === 2],
            'documents' => [$this->kakaoDocument(md5($r['rect'].$r['page']), 'A', 10)],
        ]));

        // 300m → 2×2 칸, 칸마다 2쪽
        $this->getJson(route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 300]))
            ->assertOk()
            ->assertJsonCount(8, 'places');

        Http::assertSentCount(8);
    }

    public function test_searches_the_whole_radius_in_tiles_and_drops_corners_outside_it(): void
    {
        // 식당이 빽빽해도 반경 전체가 채워지도록 3×3 칸으로 나눠 검색 (500m)
        Http::fake(fn (Request $r) => Http::response([
            'meta' => ['is_end' => true],
            'documents' => [
                $this->kakaoDocument('in-'.md5($r['rect']), '안쪽', 480),
                $this->kakaoDocument('corner-'.md5($r['rect']), '모서리', 650), // 사각형 모서리 = 반경 밖
            ],
        ]));

        $this->getJson(route('restaurants.index', ['lat' => 37.56, 'lng' => 126.99, 'radius' => 500]))
            ->assertOk()
            ->assertJsonCount(9, 'places')
            ->assertJsonMissing(['name' => '모서리']);

        $rects = [];
        Http::assertSent(function (Request $r) use (&$rects) {
            $rects[] = $r['rect'];

            return true;
        });
        $this->assertCount(9, array_unique($rects));
    }

    public function test_caches_results_for_the_same_spot(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response(['meta' => ['is_end' => true], 'documents' => []])]);

        $params = ['lat' => 37.4, 'lng' => 127.1, 'radius' => 1000];
        $this->getJson(route('restaurants.index', $params))->assertOk();
        $this->getJson(route('restaurants.index', $params))->assertOk();

        Http::assertSentCount(16); // 1km → 4×4 칸, 두 번째는 캐시
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

    public function test_all_types_excludes_snack_shops(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response([
            'meta' => ['is_end' => true],
            'documents' => [
                $this->kakaoDocument('1', '국밥집', 50),
                $this->kakaoDocument('2', '빵집', 60, '음식점 > 간식 > 제과,베이커리'),
            ],
        ])]);

        $this->getJson(route('restaurants.index', ['lat' => 37.51, 'lng' => 127.01, 'radius' => 500]))
            ->assertOk()
            ->assertJsonCount(1, 'places')
            ->assertJsonPath('places.0.name', '국밥집');
    }

    public function test_selected_types_are_searched_separately_and_merged_by_distance(): void
    {
        Http::fake(function (Request $request) {
            $docs = match ($request['query']) {
                '중식' => [
                    $this->kakaoDocument('10', '짬뽕집', 300, '음식점 > 중식 > 중국요리'),
                    $this->kakaoDocument('11', '퓨전집', 310, '음식점 > 퓨전요리'), // 다른 종류는 걸러냄
                ],
                '일식' => [
                    $this->kakaoDocument('20', '초밥집', 100, '음식점 > 일식 > 초밥,롤'),
                    $this->kakaoDocument('10', '짬뽕집', 300, '음식점 > 중식 > 중국요리'), // 다른 종류 + 중복
                ],
                default => [],
            };

            return Http::response(['meta' => ['is_end' => true], 'documents' => $docs]);
        });

        $this->getJson(route('restaurants.index', ['lat' => 37.52, 'lng' => 127.02, 'radius' => 500, 'types' => ['중식', '일식']]))
            ->assertOk()
            ->assertJsonCount(2, 'places')
            ->assertJsonPath('places.0.name', '초밥집')
            ->assertJsonPath('places.1.name', '짬뽕집');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'keyword.json') && $r['query'] === '중식' && $r['category_group_code'] === 'FD6');
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'keyword.json') && $r['query'] === '일식');
    }

    public function test_rejects_unknown_types(): void
    {
        Http::fake();

        $this->getJson(route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 500, 'types' => ['간식']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['types.0']);
    }

    public function test_menu_search_returns_nearby_matches(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response([
            'meta' => ['is_end' => true],
            'documents' => [$this->kakaoDocument('30', '안심짬뽕', 101, '음식점 > 중식 > 중국요리')],
        ])]);

        $this->getJson(route('restaurants.search', ['q' => ' 짬뽕 ', 'lat' => 37.53, 'lng' => 127.03, 'radius' => 1000]))
            ->assertOk()
            ->assertJsonPath('places.0.name', '안심짬뽕')
            ->assertJsonPath('places.0.type', '중식');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'keyword.json') && $r['query'] === '짬뽕' && (int) $r['radius'] === 1000);
    }

    public function test_menu_search_requires_a_query(): void
    {
        Http::fake();

        $this->getJson(route('restaurants.search', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 500]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['q']);

        Http::assertNothingSent();
    }

    public function test_menu_search_ranks_by_category_tags_and_leaves_out_pubs(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response([
            'meta' => ['is_end' => true],
            'documents' => [
                $this->kakaoDocument('pub', '맥주창고', 50, '음식점 > 술집 > 호프,요리주점'),        // 피자 안주
                $this->kakaoDocument('snack', '김밥나라', 60, '음식점 > 분식'),                     // 메뉴에만 피자
                $this->kakaoDocument('named', '동네피자펍', 300, '음식점 > 술집 > 호프,요리주점'),   // 이름에 피자
                $this->kakaoDocument('far', '나폴리화덕', 400, '음식점 > 양식 > 피자'),            // 태그 일치 (멀어도 위)
                $this->kakaoDocument('near', '피자스쿨', 200, '음식점 > 양식 > 피자'),
            ],
        ])]);

        $res = $this->getJson(route('restaurants.search', ['q' => '피자', 'lat' => 37.54, 'lng' => 127.04, 'radius' => 500]))
            ->assertOk();

        // 주점(맥주창고·동네피자펍)은 이름에 검색어가 있어도 뺌
        $this->assertSame(['near', 'far', 'snack'], array_column($res->json('places'), 'id'));
        $this->assertSame(['tag', 'tag', 'menu'], array_column($res->json('places'), 'match'));
    }
}
