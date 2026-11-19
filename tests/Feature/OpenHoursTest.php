<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OpenHoursTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.kakao.rest_api_key' => 'test-rest-key']);
        Cache::flush();
    }

    /** @param  list<array<string, mixed>>  $days */
    private function detail(string $code, string $text, string $info, array $days): array
    {
        return ['open_hours' => [
            'headline' => ['code' => $code, 'display_text' => $text, 'display_text_info' => $info],
            'week_from_today' => ['week_periods' => [['days' => $days]]],
        ]];
    }

    public function test_maps_headline_codes_and_today_hours(): void
    {
        Http::fake([
            'place-api.map.kakao.com/places/panel3/101' => Http::response($this->detail('OPEN', '영업 중', '22:00 까지', [
                ['day_of_the_week_desc' => '목(11/19)', 'on_days' => ['start_end_time_desc' => '11:30 ~ 22:00'], 'is_highlight' => true],
            ])),
            'place-api.map.kakao.com/places/panel3/102' => Http::response($this->detail('BREAK_TIME', '브레이크타임', '16:30 오픈', [
                ['day_of_the_week_desc' => '수(11/18)', 'on_days' => ['start_end_time_desc' => '10:00 ~ 21:00'], 'is_highlight' => false],
                ['day_of_the_week_desc' => '목(11/19)', 'on_days' => ['start_end_time_desc' => '11:00 ~ 20:30', 'break_times_desc' => ['14:30 ~ 16:30 브레이크타임']], 'is_highlight' => true],
            ])),
            'place-api.map.kakao.com/places/panel3/103' => Http::response($this->detail('CLOSED', '영업 마감', '내일 10:00 오픈', [
                ['day_of_the_week_desc' => '토(11/21)', 'off_days_desc' => '휴무일', 'is_highlight' => true],
            ])),
            'place-api.map.kakao.com/places/panel3/104' => Http::response(['open_hours' => null]),
        ]);

        $this->getJson(route('restaurants.hours', ['ids' => ['101', '102', '103', '104']]))
            ->assertOk()
            ->assertExactJson(['hours' => [
                '101' => ['status' => 'open', 'label' => '영업 중', 'info' => '22:00 까지', 'today' => '11:30 ~ 22:00'],
                '102' => ['status' => 'break', 'label' => '브레이크타임', 'info' => '16:30 오픈', 'today' => '11:00 ~ 20:30 (브레이크 14:30 ~ 16:30)'],
                '103' => ['status' => 'closed', 'label' => '영업 마감', 'info' => '내일 10:00 오픈', 'today' => '휴무일'],
                '104' => ['status' => 'unknown', 'label' => '', 'info' => '', 'today' => ''],
            ]]);
    }

    public function test_never_sends_the_rest_api_key_to_the_unofficial_endpoint(): void
    {
        Http::fake(['place-api.map.kakao.com/*' => Http::response(['open_hours' => null])]);

        $this->getJson(route('restaurants.hours', ['ids' => ['101']]))->assertOk();

        Http::assertSent(fn (Request $r) => ! $r->hasHeader('Authorization'));
    }

    public function test_failures_become_unknown_and_are_retried_after_a_short_while(): void
    {
        Http::fake([
            'place-api.map.kakao.com/places/panel3/201' => Http::sequence()
                ->push('blocked', 403)
                ->push($this->detail('OPEN', '영업 중', '21:00 까지', [])),
            'place-api.map.kakao.com/places/panel3/202' => Http::response('<html>', 200),
        ]);

        $this->getJson(route('restaurants.hours', ['ids' => ['201', '202']]))
            ->assertOk()
            ->assertJsonPath('hours.201.status', 'unknown')
            ->assertJsonPath('hours.202.status', 'unknown');

        // 실패는 2분만 기억: 그 안엔 다시 두드리지 않고
        $this->getJson(route('restaurants.hours', ['ids' => ['201']]))
            ->assertOk()
            ->assertJsonPath('hours.201.status', 'unknown');
        Http::assertSentCount(2);

        // 지나면 다시 물어봄
        $this->travel(3)->minutes();
        $this->getJson(route('restaurants.hours', ['ids' => ['201']]))
            ->assertOk()
            ->assertJsonPath('hours.201.status', 'open');
    }

    public function test_successful_results_are_cached(): void
    {
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('OPEN', '영업 중', '', []))]);

        $this->getJson(route('restaurants.hours', ['ids' => ['301']]))->assertOk();
        $this->getJson(route('restaurants.hours', ['ids' => ['301']]))->assertOk()->assertJsonPath('hours.301.status', 'open');

        Http::assertSentCount(1);
    }

    public function test_validates_ids(): void
    {
        Http::fake();

        $this->getJson(route('restaurants.hours'))->assertUnprocessable()->assertJsonValidationErrors(['ids']);
        $this->getJson(route('restaurants.hours', ['ids' => ['../etc']]))->assertUnprocessable()->assertJsonValidationErrors(['ids.0']);
        $this->getJson(route('restaurants.hours', ['ids' => array_map('strval', range(1, 13))]))->assertUnprocessable()->assertJsonValidationErrors(['ids']);

        Http::assertNothingSent();
    }

    public function test_returns_busy_when_budget_is_spent(): void
    {
        config(['services.kakao.detail_minute_budget' => 1]);
        Http::fake(['place-api.map.kakao.com/*' => Http::response(['open_hours' => null])]);

        $this->getJson(route('restaurants.hours', ['ids' => ['401', '402']]))
            ->assertStatus(503)
            ->assertHeader('Retry-After', '60');

        Http::assertNothingSent();
    }

    public function test_hours_do_not_spend_the_search_budget(): void
    {
        config(['services.kakao.minute_budget' => 1]);
        Http::fake(['place-api.map.kakao.com/*' => Http::response(['open_hours' => null])]);

        $this->getJson(route('restaurants.hours', ['ids' => ['501', '502', '503']]))->assertOk();
    }
}
