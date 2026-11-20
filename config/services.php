<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'kakao' => [
        'js_key' => env('KAKAO_JS_KEY'),          // 브라우저용 (지도 SDK)
        'rest_api_key' => env('KAKAO_REST_API_KEY'), // 서버 전용 (로컬 검색 API)
        // 카카오 호출 예산: 넘으면 503 으로 거절 (요청 폭주·할당량 소진 방지)
        'minute_budget' => (int) env('KAKAO_MINUTE_BUDGET', 600),
        'daily_budget' => (int) env('KAKAO_DAILY_BUDGET', 50000),
        // 영업시간(비공식 장소 상세) 호출은 따로 셈: 몰려도 식당 검색 예산을 먹지 않게
        'detail_minute_budget' => (int) env('KAKAO_DETAIL_MINUTE_BUDGET', 600),
        'detail_daily_budget' => (int) env('KAKAO_DETAIL_DAILY_BUDGET', 20000),
    ],

];
