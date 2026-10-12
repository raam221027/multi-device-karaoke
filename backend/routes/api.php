<?php

use App\Http\Controllers\MeController;
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
        $db = true;
    } catch (Throwable) {
        $db = false;
    }

    return response()->json([
        'status' => 'ok',
        'db' => $db,
        'time' => now()->toIso8601String(),
    ]);
});

// Public: create a room, or look up / join one by code. The code is the only
// join credential, so these share a per-IP limit against guessing.
Route::post('/rooms', [RoomController::class, 'store'])->middleware('throttle:room-create');

Route::middleware('throttle:room-code')->group(function () {
    Route::get('/rooms/code/{code}', [RoomController::class, 'lookup']);
    Route::post('/rooms/join', [RoomController::class, 'join']);
});

// Device sessions: a Sanctum token whose ability is the participant's role.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', MeController::class);

    Route::get('/rooms/{room}/state', [RoomController::class, 'state']);
    Route::post('/rooms/{room}/leave', [RoomController::class, 'leave'])->middleware('ability:guest');
    Route::post('/rooms/{room}/close', [RoomController::class, 'close'])->middleware('ability:host');
});
