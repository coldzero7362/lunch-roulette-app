<?php

use App\Http\Controllers\RestaurantController;
use Illuminate\Support\Facades\Route;

// 점심 룰렛 (로그인 없이 사용)
Route::view('/', 'roulette')->name('home');
Route::middleware('throttle:60,1')->group(function () {
    Route::get('restaurants', [RestaurantController::class, 'index'])->name('restaurants.index');
    Route::get('restaurants/search', [RestaurantController::class, 'search'])->name('restaurants.search');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::view('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
