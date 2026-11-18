# 개발용 이미지: PHP 8.5 + Apache + Composer + Node 26 (에셋 빌드용)
FROM node:26-bookworm-slim AS node

FROM php:8.5-apache

RUN apt-get update \
 && apt-get install -y --no-install-recommends libicu-dev libzip-dev unzip git \
 && docker-php-ext-install intl zip bcmath pcntl \
 && a2enmod rewrite \
 && rm -rf /var/lib/apt/lists/*

# Laravel은 public/ 이 웹 루트
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf

# Node (npm 포함)
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# 바인드 마운트한 소스 소유자(호스트 devloper)와 www-data UID를 맞춤
ARG UID=1001
ARG GID=1001
RUN groupmod -o -g ${GID} www-data && usermod -o -u ${UID} -g ${GID} www-data \
 && mkdir -p /var/www/.npm /var/www/.composer && chown -R www-data:www-data /var/www

WORKDIR /var/www/html
