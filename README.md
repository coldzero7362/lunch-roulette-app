# lunch-roulette-app
PHP 8.5 · Laravel 13 · Livewire 4 (Flux) · SQLite

## 개발 환경

```bash
docker compose up -d --build                         # https://lunch.158-247-240-171.sslip.io (또는 http://<서버IP>:8001)
docker compose exec -u www-data app php artisan ...  # artisan / composer 는 컨테이너 안에서
docker compose exec -u www-data app npm run build    # CSS/JS 변경 후 에셋 빌드
docker compose exec -u www-data app php artisan test
```

처음 받은 경우: `cp .env.example .env` 후 컨테이너 안에서 `composer setup`.

HTTPS는 서버의 공용 Caddy 프록시(`~/infra/proxy`, 외부 네트워크 `proxy`)가 처리한다. 브라우저 위치 권한은 HTTPS 주소에서만 동작한다.

## 계정 기능

로그인·회원가입·대시보드·설정 화면은 코드만 남겨 두고 막아 두었다 (`AUTH_PAGES_ENABLED=false` → 404, `app/Http/Middleware/BlockAuthPages.php`). 다시 쓰려면 `.env`에서 `true`로 바꾼다. 테스트는 `phpunit.xml`에서 켜 둔 상태로 돈다.

## 보안

| 대상 | 조치 |
|---|---|
| 프록시 우회·IP 위조 | 앱 포트는 `127.0.0.1:8001`만 열림. 외부 접속은 모두 Caddy(HTTPS). `TRUSTED_PROXIES`(도커 내부망)만 `X-Forwarded-For`를 믿음 |
| 요청 폭주 | `/restaurants` IP당 20회/분·전체 300회/분, 검색 IP당 30회/분·전체 600회/분 (`AppServiceProvider`) |
| 카카오 호출 증폭 | 호출 예산 `KAKAO_MINUTE_BUDGET`/`KAKAO_DAILY_BUDGET`. 넘으면 카카오를 부르지 않고 503 |
| 디스크 채우기 | 캐시·요청 제한은 Redis(64MB 상한, 오래된 키부터 삭제), 세션은 쿠키(서버에 안 쌓임) |
| 스크립트 주입(XSS) | 응답마다 바뀌는 nonce 기반 CSP (`SecurityHeaders`), 화면 글자는 `textContent`로만 넣음 |
| 기타 | 클릭재킹·MIME 스니핑 차단 헤더, HSTS·요청 1MB 제한·느린 연결 타임아웃(Caddy), 검색어 제어문자 거부, 저장소 파일 웹 제공 끔, `APP_DEBUG=false` |
