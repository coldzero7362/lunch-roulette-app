<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 계정 기능(로그인·회원가입·대시보드·설정)을 쓰지 않는 동안 그 주소들을 404로 막는다.
 * 코드는 그대로 두므로 AUTH_PAGES_ENABLED=true 로 켜면 다시 살아난다.
 */
class BlockAuthPages
{
    /** @var list<string> */
    private const PATHS = [
        'login',
        'logout',
        'register',
        'forgot-password',
        'reset-password',
        'reset-password/*',
        'two-factor-challenge',
        'user/*',
        'dashboard',
        'settings',
        'settings/*',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if (! config('auth.pages_enabled') && $request->is(...self::PATHS)) {
            abort(404);
        }

        return $next($request);
    }
}
