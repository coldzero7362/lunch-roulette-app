# lunch-roulette-app
PHP 8.5 · Laravel 13 · Livewire 4 (Flux) · SQLite

## 개발 환경

```bash
docker compose up -d --build                         # http://<서버IP>:8001
docker compose exec -u www-data app php artisan ...  # artisan / composer 는 컨테이너 안에서
docker compose exec -u www-data app npm run build    # CSS/JS 변경 후 에셋 빌드
docker compose exec -u www-data app php artisan test
```

처음 받은 경우: `cp .env.example .env` 후 컨테이너 안에서 `composer setup`.
