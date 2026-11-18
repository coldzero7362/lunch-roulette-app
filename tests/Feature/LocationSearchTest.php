<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LocationSearchTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.kakao.rest_api_key' => 'test-rest-key']);
    }

    public function test_exact_address_comes_first_then_places(): void
    {
        Http::fake([
            'dapi.kakao.com/v2/local/search/address.json*' => Http::response(['documents' => [[
                'address_name' => '서울 강남구 테헤란로 427',
                'road_address' => ['address_name' => '서울 강남구 테헤란로 427'],
                'x' => '127.0536', 'y' => '37.5063',
            ]]]),
            'dapi.kakao.com/v2/local/search/keyword.json*' => Http::response(['documents' => [[
                'place_name' => '위워크 선릉 2호점',
                'road_address_name' => '서울 강남구 테헤란로 427',
                'address_name' => '서울 강남구 대치동 945-10',
                'category_group_name' => '',
                'x' => '127.0537', 'y' => '37.5064',
            ]]]),
        ]);

        $this->getJson(route('locations.search', ['q' => '테헤란로 427']))
            ->assertOk()
            ->assertExactJson(['locations' => [
                ['name' => '서울 강남구 테헤란로 427', 'address' => '서울 강남구 테헤란로 427', 'kind' => 'address', 'lat' => 37.5063, 'lng' => 127.0536],
                ['name' => '위워크 선릉 2호점', 'address' => '서울 강남구 테헤란로 427', 'kind' => '', 'lat' => 37.5064, 'lng' => 127.0537],
            ]]);

        Http::assertSent(fn (Request $r) => $r->hasHeader('Authorization', 'KakaoAK test-rest-key') && $r['query'] === '테헤란로 427');
    }

    public function test_requires_a_query(): void
    {
        Http::fake();

        $this->getJson(route('locations.search'))->assertUnprocessable()->assertJsonValidationErrors(['q']);

        Http::assertNothingSent();
    }

    public function test_returns_bad_gateway_when_kakao_fails(): void
    {
        Http::fake(['dapi.kakao.com/*' => Http::response([], 500)]);

        $this->getJson(route('locations.search', ['q' => '강남역']))->assertStatus(502);
    }
}
