<?php

namespace Tests\Feature;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthPagesBlockedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['auth.pages_enabled' => false]);
    }

    /** @return array<string, array{string, string}> */
    public static function accountPages(): array
    {
        return [
            'login' => ['GET', '/login'],
            'login submit' => ['POST', '/login'],
            'register' => ['GET', '/register'],
            'register submit' => ['POST', '/register'],
            'logout' => ['POST', '/logout'],
            'forgot password' => ['GET', '/forgot-password'],
            'reset password' => ['GET', '/reset-password/some-token'],
            'two factor challenge' => ['GET', '/two-factor-challenge'],
            'confirm password' => ['GET', '/user/confirm-password'],
            'dashboard' => ['GET', '/dashboard'],
            'settings' => ['GET', '/settings'],
            'settings profile' => ['GET', '/settings/profile'],
        ];
    }

    #[DataProvider('accountPages')]
    public function test_account_pages_are_not_found_while_disabled(string $method, string $uri): void
    {
        $this->withoutMiddleware(ValidateCsrfToken::class)
            ->call($method, $uri)
            ->assertNotFound();
    }

    public function test_roulette_still_works_while_account_pages_are_disabled(): void
    {
        config(['services.kakao.rest_api_key' => 'test-rest-key']);
        Http::fake(['dapi.kakao.com/*' => Http::response(['meta' => ['is_end' => true], 'documents' => []])]);

        $this->get('/')->assertOk();
        $this->getJson(route('restaurants.index', ['lat' => 37.5, 'lng' => 127.0, 'radius' => 500]))->assertOk();
    }

    public function test_account_pages_open_again_when_enabled(): void
    {
        config(['auth.pages_enabled' => true]);

        $this->get('/login')->assertOk();
    }
}
