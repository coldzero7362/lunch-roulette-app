<?php

use App\Http\Middleware\BlockAuthPages;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Caddy(HTTPS 리버스 프록시) 뒤에서 https 스킴/호스트를 올바르게 인식
        $middleware->trustProxies(at: '*');

        // 계정 기능을 쓰지 않는 동안 로그인·대시보드 등 주소를 막음 (config/auth.php pages_enabled)
        $middleware->web(prepend: [BlockAuthPages::class]);
        // 로그인 확인(auth)이 먼저 돌면 404 대신 로그인으로 보내 버리므로 그보다 앞에 둔다
        $middleware->prependToPriorityList(before: AuthenticatesRequests::class, prepend: BlockAuthPages::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
