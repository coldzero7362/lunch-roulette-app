<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * 오늘 시간대별 날씨 (Open-Meteo, 키 없음). 뽑기에서 '비·폭염·한파면 가까운 곳 위주'로 쓰는 정도라
 * 좌표를 0.1°(약 10km) 격자로 묶어 1시간 캐시 → 한 동네는 한 시간에 한 번만 부른다.
 *
 * @phpstan-type Hour array{rain: float, prob: int|null, feels: float|null}
 */
class Weather
{
    private const CACHE = 'weather:v1:';

    private const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

    public function __construct(
        private readonly int $dailyBudget = 3000, // Open-Meteo 비상업 한도(하루 1만)보다 넉넉히 아래
    ) {}

    /** 좌표 → 캐시 칸 (0.1° 격자) */
    public static function cell(float $lat, float $lng): string
    {
        return sprintf('%.1f,%.1f', round($lat, 1), round($lng, 1));
    }

    /**
     * 오늘(한국 시각) 0~23시 예보. 못 받으면 null (보정 없이 뽑으면 됨)
     *
     * @return array{cell: string, date: string, hours: array<string, Hour>}|null
     */
    public function today(float $lat, float $lng): ?array
    {
        $cell = self::cell($lat, $lng);
        $now = CarbonImmutable::now('Asia/Seoul');
        $key = self::CACHE.$now->format('Ymd').':'.$cell;

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached === false ? null : $cached;
        }

        $data = $this->fetch($cell, $now->format('Y-m-d'));
        // 성공: 다음 정시까지 (예보가 한 시간마다 갱신), 실패: 10분 뒤 다시
        $ttl = $data === null ? 600 : max(60, $now->startOfHour()->addHour()->diffInSeconds($now, true));
        Cache::put($key, $data ?? false, (int) $ttl);

        return $data;
    }

    /** @return array{cell: string, date: string, hours: array<string, Hour>}|null */
    private function fetch(string $cell, string $date): ?array
    {
        if (RateLimiter::tooManyAttempts('weather:budget:day', $this->dailyBudget)) {
            Log::warning('Weather call budget exhausted');

            return null;
        }
        RateLimiter::increment('weather:budget:day', 86400);

        [$lat, $lng] = array_map('floatval', explode(',', $cell));
        try {
            $response = Http::timeout(4)->get(self::ENDPOINT, [
                'latitude' => $lat,
                'longitude' => $lng,
                'hourly' => 'precipitation,precipitation_probability,apparent_temperature',
                'timezone' => 'Asia/Seoul',
                'forecast_days' => 1,
            ]);
        } catch (ConnectionException) {
            return null;
        }
        if (! $response->successful()) {
            return null;
        }

        $hourly = $response->json('hourly');
        if (! is_array($hourly) || ! is_array($hourly['time'] ?? null)) {
            return null;
        }

        $hours = [];
        foreach ($hourly['time'] as $i => $time) {
            // "2026-11-23T12:00" → "12" (오늘 것만)
            if (! is_string($time) || ! str_starts_with($time, $date.'T')) {
                continue;
            }
            $num = fn (string $field) => is_numeric($hourly[$field][$i] ?? null) ? (float) $hourly[$field][$i] : null;
            $prob = $num('precipitation_probability');
            $hours[substr($time, 11, 2)] = [
                'rain' => $num('precipitation') ?? 0.0,
                'prob' => $prob === null ? null : (int) $prob,
                'feels' => $num('apparent_temperature'),
            ];
        }

        return $hours === [] ? null : ['cell' => $cell, 'date' => $date, 'hours' => $hours];
    }
}
