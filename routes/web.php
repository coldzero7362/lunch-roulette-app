<?php

use App\Http\Controllers\RestaurantController;
use App\Http\Controllers\WeatherController;
use Illuminate\Support\Facades\Route;

// 점심 룰렛 (로그인 없이 사용)
Route::view('/', 'roulette')->name('home');
// 요청 제한 기준은 AppServiceProvider::configureRateLimiting
Route::get('restaurants', [RestaurantController::class, 'index'])
    ->middleware('throttle:restaurants')->name('restaurants.index');
Route::middleware('throttle:lookup')->group(function () {
    Route::get('restaurants/search', [RestaurantController::class, 'search'])->name('restaurants.search');
    Route::get('restaurants/hours', [RestaurantController::class, 'hours'])->name('restaurants.hours');
    Route::get('locations/search', [RestaurantController::class, 'locations'])->name('locations.search');
    Route::get('weather', WeatherController::class)->name('weather');
});
