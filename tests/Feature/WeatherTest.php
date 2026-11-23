<?php

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WeatherTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-23 11:20', 'Asia/Seoul'));
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function fakeForecast(): void
    {
        Http::fake(['api.open-meteo.com/*' => Http::response(['hourly' => [
            'time' => ['2026-11-23T11:00', '2026-11-23T12:00', '2026-11-24T00:00'],
            'precipitation' => [0, 1.2, 0],
            'precipitation_probability' => [10, 80, 0],
            'apparent_temperature' => [3.5, 2.1, 0],
        ]])]);
    }

    public function test_returns_todays_hours_for_a_coarse_cell(): void
    {
        $this->fakeForecast();

        $this->getJson(route('weather', ['lat' => 37.3947, 'lng' => 127.1112]))
            ->assertOk()
            ->assertJsonPath('weather.cell', '37.4,127.1')
            ->assertJsonPath('weather.hours.12', ['rain' => 1.2, 'prob' => 80, 'feels' => 2.1])
            ->assertJsonMissingPath('weather.hours.00');

        // 격자로 반올림한 좌표만 보냄 (정확한 위치는 밖으로 안 나감)
        Http::assertSent(fn ($request) => str_contains($request->url(), 'latitude=37.4') && str_contains($request->url(), 'longitude=127.1'));
    }

    public function test_one_call_per_cell_per_hour(): void
    {
        $this->fakeForecast();

        $this->getJson(route('weather', ['lat' => 37.3947, 'lng' => 127.1112]))->assertOk();
        $this->getJson(route('weather', ['lat' => 37.41, 'lng' => 127.09]))->assertOk(); // 같은 칸

        Http::assertSentCount(1);
    }

    public function test_failure_gives_null_and_is_cached_briefly(): void
    {
        Http::fake(['api.open-meteo.com/*' => Http::response('down', 500)]);

        $this->getJson(route('weather', ['lat' => 37.39, 'lng' => 127.11]))->assertOk()->assertJsonPath('weather', null);
        $this->getJson(route('weather', ['lat' => 37.39, 'lng' => 127.11]))->assertOk()->assertJsonPath('weather', null);

        Http::assertSentCount(1);
    }

    public function test_rejects_coordinates_outside_korea(): void
    {
        $this->getJson(route('weather', ['lat' => 51.5, 'lng' => -0.1]))->assertUnprocessable();
    }
}
