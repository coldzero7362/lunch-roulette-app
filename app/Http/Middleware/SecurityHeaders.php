<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * 보안 헤더.
 *
 * CSP: 스크립트는 이번 응답의 nonce 가 붙은 것만 실행 ('strict-dynamic' 으로 그 스크립트가 불러오는 카카오 지도 스크립트는 허용).
 * 누가 페이지에 <script> 를 끼워 넣어도(XSS) nonce 를 모르면 실행되지 않는다.
 * 스타일은 카카오 지도가 요소에 style 속성을 직접 넣어서 'unsafe-inline' 을 둔다.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // @vite 태그와 레이아웃의 <script nonce> 가 같은 값을 쓰도록 응답 만들기 전에 정한다
        $nonce = Vite::useCspNonce();

        $response = $next($request);

        $csp = implode('; ', [
            "default-src 'self'",
            "script-src 'nonce-{$nonce}' 'strict-dynamic' https: 'unsafe-inline'", // https:/unsafe-inline 은 strict-dynamic 을 모르는 옛 브라우저용 (최신 브라우저는 무시)
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.daumcdn.net https://*.kakao.com https://*.kakaocdn.net",
            "font-src 'self'",
            "connect-src 'self' https://*.kakao.com https://*.daumcdn.net",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]);

        $response->headers->set('Content-Security-Policy', $csp);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()');
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');

        return $response;
    }
}
