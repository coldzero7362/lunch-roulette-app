<?php

use App\Http\Controllers\RestaurantController;
use Illuminate\Support\Facades\Route;

// 점심 룰렛 (로그인 없이 사용)
Route::view('/', 'roulette')->name('home');
Route::get('restaurants', [RestaurantController::class, 'index'])
    ->middleware('throttle:30,1')
    ->name('restaurants.index');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::view('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
