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
