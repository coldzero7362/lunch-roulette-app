<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 브라우저 위치 권한은 HTTPS 에서만 동작한다.
 * http 로 직접 들어온 화면 요청(예: http://<IP>:8001)을 APP_URL(https)로 보낸다.
 * FORCE_HTTPS=true 일 때만 동작 (테스트·로컬 개발은 그대로).
 */
class RedirectToSecureUrl
{
    public function handle(Request $request, Closure $next): Response
    {
        $appUrl = (string) config('app.url');

        if (config('app.force_https')
            && ! $request->secure()
            && $request->isMethod('GET')
            && str_starts_with($appUrl, 'https://')) {
            return redirect()->to(rtrim($appUrl, '/').$request->getRequestUri(), 302);
        }

        return $next($request);
    }
}
