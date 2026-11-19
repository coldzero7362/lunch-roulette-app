<?php

use App\Http\Middleware\BlockAuthPages;
use App\Http\Middleware\RedirectToSecureUrl;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Env;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Caddy(HTTPS 리버스 프록시) 뒤에서 https 스킴/호스트·실제 IP를 인식.
        // 도커 내부망(Caddy)만 믿는다: 아무나 X-Forwarded-For 를 바꿔 IP를 속여 요청 제한을 피하지 못하게
        $middleware->trustProxies(at: explode(',', (string) Env::get('TRUSTED_PROXIES', '172.16.0.0/12')));

        // CSP(nonce)·클릭재킹·MIME 스니핑 방지 등 보안 헤더
        $middleware->web(append: [SecurityHeaders::class]);

        // 계정 기능을 쓰지 않는 동안 로그인·대시보드 등 주소를 막음 (config/auth.php pages_enabled)
        $middleware->web(prepend: [BlockAuthPages::class]);
        // http 로 직접 들어오면 https 주소로 (위치 권한은 HTTPS 에서만 동작)
        $middleware->web(prepend: [RedirectToSecureUrl::class]);
        // 로그인 확인(auth)이 먼저 돌면 404 대신 로그인으로 보내 버리므로 그보다 앞에 둔다
        $middleware->prependToPriorityList(before: AuthenticatesRequests::class, prepend: BlockAuthPages::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
