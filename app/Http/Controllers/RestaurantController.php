<?php

namespace App\Http\Controllers;

use App\Services\KakaoLocal;
use Closure;
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
     * 좌표 반경 안의 식당 목록 (룰렛 후보). types[] 로 종류를 고를 수 있다.
     */
    public function index(Request $request, KakaoLocal $kakao): JsonResponse
    {
        $data = $request->validate($this->areaRules() + [
            'types' => ['sometimes', 'array', 'max:'.count(KakaoLocal::TYPES)],
            'types.*' => ['string', Rule::in(KakaoLocal::TYPES)],
        ]);

        return $this->respond(fn () => $kakao->nearbyRestaurants(
            (float) $data['lat'], (float) $data['lng'], (int) $data['radius'], array_values($data['types'] ?? []),
        ));
    }

    /**
     * 메뉴·가게 이름으로 반경 안 식당 검색 (후보에 직접 넣기용).
     */
    public function search(Request $request, KakaoLocal $kakao): JsonResponse
    {
        $data = $request->validate($this->areaRules() + [
            'q' => ['required', 'string', 'min:1', 'max:30'],
        ]);

        return $this->respond(fn () => $kakao->searchRestaurants(
            trim($data['q']), (float) $data['lat'], (float) $data['lng'], (int) $data['radius'],
        ));
    }

    /**
     * 위치 정하기: 주소·역·건물 이름으로 좌표 찾기 (PC처럼 현재 위치가 부정확할 때).
     */
    public function locations(Request $request, KakaoLocal $kakao): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:50'],
        ]);

        try {
            $locations = $kakao->searchLocations(trim($data['q']));
        } catch (RequestException|ConnectionException $e) {
            Log::warning('Kakao location search failed', ['message' => $e->getMessage()]);

            return response()->json(['message' => '위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.'], 502);
        }

        return response()->json(['locations' => $locations]);
    }

    /** @return array<string, list<mixed>> */
    private function areaRules(): array
    {
        return [
            // 카카오 로컬 API는 국내만 지원
            'lat' => ['required', 'numeric', 'between:33,39'],
            'lng' => ['required', 'numeric', 'between:124,132'],
            'radius' => ['required', 'integer', Rule::in(self::RADII)],
        ];
    }

    /**
     * @param  Closure(): list<array<string, mixed>>  $fetch
     */
    private function respond(Closure $fetch): JsonResponse
    {
        try {
            $places = $fetch();
        } catch (RequestException|ConnectionException $e) {
            Log::warning('Kakao local search failed', ['message' => $e->getMessage()]);

            return response()->json(['message' => '식당 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'], 502);
        }

        return response()->json(['places' => $places]);
    }
}
