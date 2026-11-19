<?php

namespace App\Providers;

use App\Services\KakaoLocal;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(KakaoLocal::class, fn () => new KakaoLocal(
            (string) config('services.kakao.rest_api_key'),
            (int) config('services.kakao.minute_budget'),
            (int) config('services.kakao.daily_budget'),
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimiting();
    }

    /**
     * 요청 제한: IP별 + 서버 전체. 식당 검색은 카카오 호출이 많아 더 빡빡하게.
     * (IP는 TrustProxies 로 Caddy 가 알려 준 실제 접속 IP)
     */
    protected function configureRateLimiting(): void
    {
        RateLimiter::for('restaurants', fn (Request $request) => [
            Limit::perMinute(20)->by('restaurants:'.$request->ip()),
            Limit::perMinute(300)->by('restaurants:all'),
        ]);

        RateLimiter::for('lookup', fn (Request $request) => [
            Limit::perMinute(30)->by('lookup:'.$request->ip()),
            Limit::perMinute(600)->by('lookup:all'),
        ]);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
