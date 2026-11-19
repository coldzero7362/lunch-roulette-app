<?php

namespace App\Http\Controllers;

use App\Services\KakaoBudgetExceeded;
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
            'q' => ['required', 'string', 'min:1', 'max:30', 'not_regex:/[\x00-\x1F\x7F]/'],
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
            'q' => ['required', 'string', 'min:1', 'max:50', 'not_regex:/[\x00-\x1F\x7F]/'],
        ]);

        try {
            $locations = $kakao->searchLocations(trim($data['q']));
        } catch (KakaoBudgetExceeded) {
            return $this->busy();
        } catch (RequestException|ConnectionException $e) {
            Log::warning('Kakao location search failed', ['message' => $e->getMessage()]);

            return response()->json(['message' => '위치 조회 실패 — 잠시 후 재시도'], 502);
        }

        return response()->json(['locations' => $locations]);
    }

    /** 카카오 호출 예산을 다 씀: 잠깐 쉬었다 오라고 알림 */
    private function busy(): JsonResponse
    {
        Log::warning('Kakao call budget exhausted');

        return response()
            ->json(['message' => '조회량 초과 — 잠시 후 재시도'], 503)
            ->header('Retry-After', '60');
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
        } catch (KakaoBudgetExceeded) {
            return $this->busy();
        } catch (RequestException|ConnectionException $e) {
            Log::warning('Kakao local search failed', ['message' => $e->getMessage()]);

            return response()->json(['message' => '식당 조회 실패 — 잠시 후 재시도'], 502);
        }

        return response()->json(['places' => $places]);
    }
}
