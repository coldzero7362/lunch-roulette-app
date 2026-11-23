<?php

namespace Tests\Feature;

use Carbon\CarbonImmutable;
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
        $this->travelTo(CarbonImmutable::parse('2026-11-19 12:00', 'Asia/Seoul'));
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
            'place-api.map.kakao.com/places/panel3/105' => Http::response($this->detail('CLOSING_SOON', '곧 영업 마감', '22:00 까지', [])),
            'place-api.map.kakao.com/places/panel3/106' => Http::response($this->detail('DAY_OFF', '휴무일', '', [])),
            // 이름에 OFF 가 들어가지만 휴무가 아니라 '휴무 정보 없음'
            'place-api.map.kakao.com/places/panel3/107' => Http::response($this->detail('NO_DAY_OFF_INFO', '영업 정보', '', [])),
            // 처음 보는 코드: 문구에 휴무가 있으면 휴무, 아니면 정보 없음
            'place-api.map.kakao.com/places/panel3/108' => Http::response($this->detail('TEMP_HOLIDAY', '임시 휴무', '', [])),
            'place-api.map.kakao.com/places/panel3/109' => Http::response($this->detail('SOMETHING_NEW', '확인 필요', '', [])),
        ]);

        $this->getJson(route('restaurants.hours', ['ids' => ['101', '102', '103', '104', '105', '106', '107', '108', '109']]))
            ->assertOk()
            ->assertExactJson(['hours' => [
                '101' => ['status' => 'open', 'label' => '영업 중', 'info' => '22:00 까지', 'today' => '11:30 ~ 22:00', 'week' => [
                    ['date' => '2026-11-19', 'off' => false, 'open' => '11:30', 'close' => '22:00', 'breaks' => []],
                ], 'menus' => [], 'price' => null],
                '102' => ['status' => 'break', 'label' => '브레이크타임', 'info' => '16:30 오픈', 'today' => '11:00 ~ 20:30 (브레이크 14:30 ~ 16:30)', 'week' => [
                    ['date' => '2026-11-18', 'off' => false, 'open' => '10:00', 'close' => '21:00', 'breaks' => []],
                    ['date' => '2026-11-19', 'off' => false, 'open' => '11:00', 'close' => '20:30', 'breaks' => [['14:30', '16:30']]],
                ], 'menus' => [], 'price' => null],
                '103' => ['status' => 'closed', 'label' => '영업 마감', 'info' => '내일 10:00 오픈', 'today' => '휴무일', 'week' => [
                    ['date' => '2026-11-21', 'off' => true, 'open' => null, 'close' => null, 'breaks' => []],
                ], 'menus' => [], 'price' => null],
                '104' => ['status' => 'unknown', 'label' => '', 'info' => '', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
                '105' => ['status' => 'open', 'label' => '곧 영업 마감', 'info' => '22:00 까지', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
                '106' => ['status' => 'closed', 'label' => '휴무일', 'info' => '', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
                '107' => ['status' => 'unknown', 'label' => '영업 정보', 'info' => '', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
                '108' => ['status' => 'closed', 'label' => '임시 휴무', 'info' => '', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
                '109' => ['status' => 'unknown', 'label' => '확인 필요', 'info' => '', 'today' => '', 'week' => [], 'menus' => [], 'price' => null],
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
        $this->getJson(route('restaurants.hours', ['ids' => array_map('strval', range(1, 41))]))->assertUnprocessable()->assertJsonValidationErrors(['ids']);

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

    public function test_week_dates_roll_into_next_year_and_odd_rows_are_skipped(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-12-30 12:00', 'Asia/Seoul'));
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('OPEN', '영업 중', '', [
            ['day_of_the_week_desc' => '수(12/30)', 'on_days' => ['start_end_time_desc' => '19:00 ~ 03:00', 'break_times_desc' => ['22:00 ~ 22:30 브레이크타임']]],
            ['day_of_the_week_desc' => '목(1/1)', 'off_days_desc' => '휴무일'],
            ['day_of_the_week_desc' => '금(1/2)', 'on_days' => ['start_end_time_desc' => '예약 문의']],
            ['day_of_the_week_desc' => '토요일', 'on_days' => ['start_end_time_desc' => '10:00 ~ 20:00']],
        ]))]);

        $this->getJson(route('restaurants.hours', ['ids' => ['801']]))
            ->assertOk()
            ->assertExactJson(['hours' => ['801' => ['status' => 'open', 'label' => '영업 중', 'info' => '', 'today' => '', 'week' => [
                ['date' => '2026-12-30', 'off' => false, 'open' => '19:00', 'close' => '03:00', 'breaks' => [['22:00', '22:30']]],
                ['date' => '2027-01-01', 'off' => true, 'open' => null, 'close' => null, 'breaks' => []],
            ], 'menus' => [], 'price' => null]]]);
    }

    public function test_schedules_stay_cached_until_their_last_day(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-19 09:00', 'Asia/Seoul'));
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('BEFORE_OPEN', '영업 전', '11:00 오픈', [
            ['day_of_the_week_desc' => '목(11/19)', 'on_days' => ['start_end_time_desc' => '11:00 ~ 21:00']],
            ['day_of_the_week_desc' => '수(11/25)', 'on_days' => ['start_end_time_desc' => '11:00 ~ 21:00']],
        ]))]);

        $this->getJson(route('restaurants.hours', ['ids' => ['701']]))->assertOk();
        // 며칠 뒤에도 시간표 마지막 날(11/25) 안이면 다시 묻지 않음
        $this->travelTo(CarbonImmutable::parse('2026-11-25 20:00', 'Asia/Seoul'));
        $this->getJson(route('restaurants.hours', ['ids' => ['701']]))->assertOk();
        Http::assertSentCount(1);

        // 마지막 날이 지나면 다시 물음
        $this->travelTo(CarbonImmutable::parse('2026-11-26 09:00', 'Asia/Seoul'));
        $this->getJson(route('restaurants.hours', ['ids' => ['701']]))->assertOk();
        Http::assertSentCount(2);
    }

    public function test_fresh_skips_the_cache_for_a_single_place(): void
    {
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('OPEN', '영업 중', '', []))]);

        $this->getJson(route('restaurants.hours', ['ids' => ['702']]))->assertOk();
        $this->getJson(route('restaurants.hours', ['ids' => ['702'], 'fresh' => 1]))->assertOk();
        Http::assertSentCount(2);

        // 한 번에 여러 곳을 fresh 로 묻는 건 막음
        $this->getJson(route('restaurants.hours', ['ids' => ['702', '703'], 'fresh' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['ids']);
    }

    public function test_picks_top_menus_and_a_price_range_from_the_same_response(): void
    {
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('OPEN', '영업 중', '', []) + ['menu' => ['menus' => ['items' => [
            ['name' => '공기밥', 'price' => 1000, 'is_recommend' => false],
            ['name' => '김치찌개', 'price' => 9000, 'is_recommend' => false],
            ['name' => '제육볶음', 'price' => 11000, 'is_recommend' => true],
            ['name' => '시가', 'price' => 0],
            ['name' => '모듬전', 'price' => 22000, 'is_recommend' => false],
        ]]]])]);

        $this->getJson(route('restaurants.hours', ['ids' => ['601']]))
            ->assertOk()
            ->assertJsonPath('hours.601.menus', [
                ['name' => '제육볶음', 'price' => 11000],
                ['name' => '공기밥', 'price' => 1000],
                ['name' => '김치찌개', 'price' => 9000],
                ['name' => '모듬전', 'price' => 22000],
            ])
            ->assertJsonPath('hours.601.price', ['min' => 9000, 'max' => 22000, 'mid' => 11000]);
    }

    public function test_many_places_are_fetched_in_small_concurrent_chunks(): void
    {
        Http::fake(['place-api.map.kakao.com/*' => Http::response($this->detail('OPEN', '영업 중', '', []))]);
        $ids = array_map(fn (int $i) => (string) (900 + $i), range(1, 25));

        $this->getJson(route('restaurants.hours', ['ids' => $ids]))
            ->assertOk()
            ->assertJsonCount(25, 'hours');

        Http::assertSentCount(25);
    }

    public function test_hours_do_not_spend_the_search_budget(): void
    {
        config(['services.kakao.minute_budget' => 1]);
        Http::fake(['place-api.map.kakao.com/*' => Http::response(['open_hours' => null])]);

        $this->getJson(route('restaurants.hours', ['ids' => ['501', '502', '503']]))->assertOk();
    }
}
