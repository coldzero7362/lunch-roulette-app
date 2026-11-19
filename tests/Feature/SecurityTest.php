<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.kakao.rest_api_key' => 'test-rest-key']);
        Http::fake(['dapi.kakao.com/*' => Http::response(['meta' => ['is_end' => true], 'documents' => []])]);
    }

    private function restaurantsUrl(): string
    {
        return route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 300]);
    }

    public function test_pages_send_security_headers_with_a_csp_nonce_on_every_script(): void
    {
        $response = $this->get('/')->assertOk();

        $csp = $response->headers->get('Content-Security-Policy');
        $this->assertNotNull($csp);
        $this->assertMatchesRegularExpression("/script-src 'nonce-([A-Za-z0-9]+)' 'strict-dynamic'/", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringContainsString("object-src 'none'", $csp);

        preg_match("/'nonce-([A-Za-z0-9]+)'/", $csp, $m);
        $nonce = $m[1];

        // 페이지의 모든 <script> 가 이번 응답의 nonce 를 달고 있어야 실행된다
        preg_match_all('/<script\b[^>]*>/', $response->getContent(), $scripts);
        $this->assertNotEmpty($scripts[0]);
        foreach ($scripts[0] as $tag) {
            $this->assertStringContainsString("nonce=\"{$nonce}\"", $tag, $tag);
        }

        $response->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertStringContainsString('geolocation=(self)', $response->headers->get('Permissions-Policy'));
    }

    public function test_nonce_changes_on_every_response(): void
    {
        $a = $this->get('/')->headers->get('Content-Security-Policy');
        $b = $this->get('/')->headers->get('Content-Security-Policy');

        $this->assertNotSame($a, $b);
    }

    public function test_restaurant_search_is_rate_limited_per_ip(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->getJson($this->restaurantsUrl())->assertOk();
        }

        $this->getJson($this->restaurantsUrl())->assertTooManyRequests();
    }

    public function test_spoofed_forwarded_for_from_an_untrusted_client_does_not_bypass_the_limit(): void
    {
        // 프록시가 아닌 곳(공인 IP)에서 X-Forwarded-For 를 바꿔 가며 보내도 같은 IP로 센다
        for ($i = 0; $i < 20; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
                ->withHeader('X-Forwarded-For', "198.51.100.{$i}")
                ->getJson($this->restaurantsUrl())->assertOk();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
            ->withHeader('X-Forwarded-For', '198.51.100.99')
            ->getJson($this->restaurantsUrl())->assertTooManyRequests();
    }

    public function test_real_client_ips_behind_the_trusted_proxy_are_counted_separately(): void
    {
        // Caddy(도커 내부망)가 알려 준 실제 IP는 믿는다: 한 사람이 막혀도 다른 사람은 쓸 수 있음
        for ($i = 0; $i < 21; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '172.19.0.2'])
                ->withHeader('X-Forwarded-For', '198.51.100.1')
                ->getJson($this->restaurantsUrl());
        }

        $this->withServerVariables(['REMOTE_ADDR' => '172.19.0.2'])
            ->withHeader('X-Forwarded-For', '198.51.100.2')
            ->getJson($this->restaurantsUrl())->assertOk();
    }

    public function test_kakao_call_budget_refuses_before_calling_out(): void
    {
        config(['services.kakao.minute_budget' => 5]); // 500m 검색은 9칸이라 예산 초과

        $this->getJson(route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 500]))
            ->assertStatus(503)
            ->assertHeader('Retry-After', '60')
            ->assertJsonStructure(['message']);

        Http::assertNothingSent();
    }

    public function test_search_queries_with_control_characters_are_rejected(): void
    {
        $this->getJson(route('restaurants.search', ['q' => "짬뽕\r\nX-Injected: 1", 'lat' => 37.5, 'lng' => 127.0, 'radius' => 500]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['q']);

        $this->getJson(route('locations.search', ['q' => "강남역\t1"]))
            ->assertUnprocessable();

        Http::assertNothingSent();
    }

    public function test_storage_files_are_not_served_over_http(): void
    {
        $this->get('/storage/anything.txt')->assertNotFound();
        $this->put('/storage/anything.txt', ['x' => 1])->assertNotFound();
    }
}
