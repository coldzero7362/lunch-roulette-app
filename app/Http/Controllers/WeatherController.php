<?php

namespace App\Http\Controllers;

use App\Services\Weather;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WeatherController extends Controller
{
    /**
     * 오늘 시간대별 날씨 (뽑기 거리 보정용). 못 받으면 weather: null — 브라우저는 보정 없이 뽑음.
     */
    public function __invoke(Request $request, Weather $weather): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:33,39'],
            'lng' => ['required', 'numeric', 'between:124,132'],
        ]);

        return response()->json(['weather' => $weather->today((float) $data['lat'], (float) $data['lng'])]);
    }
}
