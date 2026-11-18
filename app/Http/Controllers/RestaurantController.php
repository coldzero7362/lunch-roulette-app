<?php

namespace App\Http\Controllers;

use App\Services\KakaoLocal;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class RestaurantController extends Controller
{
    public const RADII = [300, 500, 1000];

    /**
     * 좌표 반경 안의 식당 목록 (룰렛 후보).
     */
    public function index(Request $request, KakaoLocal $kakao): JsonResponse
    {
        $data = $request->validate([
            // 카카오 로컬 API는 국내만 지원
            'lat' => ['required', 'numeric', 'between:33,39'],
            'lng' => ['required', 'numeric', 'between:124,132'],
            'radius' => ['required', 'integer', Rule::in(self::RADII)],
        ]);

        try {
            $places = $kakao->nearbyRestaurants((float) $data['lat'], (float) $data['lng'], (int) $data['radius']);
        } catch (RequestException|ConnectionException $e) {
            Log::warning('Kakao local search failed', ['message' => $e->getMessage()]);

            return response()->json(['message' => '식당 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'], 502);
        }

        return response()->json(['places' => $places]);
    }
}
