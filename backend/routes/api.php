<?php

use App\Http\Controllers\AutocompleteController;
use App\Http\Controllers\MeController;
use App\Http\Controllers\ParticipantController;
use App\Http\Controllers\PlaybackController;
use App\Http\Controllers\QueueController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SuggestionController;
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
    Route::post('/rooms/display', [RoomController::class, 'joinAsDisplay']);
});

// Device sessions: a Sanctum token whose ability is the participant's role.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', MeController::class);

    Route::get('/rooms/{room}/state', [RoomController::class, 'state']);
    Route::post('/rooms/{room}/leave', [RoomController::class, 'leave'])->middleware('ability:guest,display');
    Route::post('/rooms/{room}/use-as-display', [RoomController::class, 'useAsDisplay'])->middleware('ability:guest');

    // Host-only room management.
    Route::middleware('ability:host')->group(function () {
        Route::post('/rooms/{room}/close', [RoomController::class, 'close']);
        Route::post('/rooms/{room}/become-display', [RoomController::class, 'becomeDisplay']);
        Route::patch('/rooms/{room}', [RoomController::class, 'update']);
        Route::patch('/rooms/{room}/participants/{participant}', [ParticipantController::class, 'update']);
        Route::delete('/rooms/{room}/participants/{participant}', [ParticipantController::class, 'destroy']);
        Route::post('/rooms/{room}/participants/{participant}/make-host', [ParticipantController::class, 'makeHost']);
        Route::post('/rooms/{room}/participants/{participant}/make-display', [ParticipantController::class, 'makeDisplay']);
        Route::put('/rooms/{room}/queue/order', [QueueController::class, 'reorder']);
        Route::post('/rooms/{room}/playback/pause', [PlaybackController::class, 'pause']);
        Route::post('/rooms/{room}/playback/resume', [PlaybackController::class, 'resume']);
    });

    // Songs: every phone can search and sing, the host included.
    Route::middleware('ability:host,guest')->group(function () {
        Route::get('/rooms/{room}/search', SearchController::class)->middleware('throttle:search');
        Route::get('/rooms/{room}/suggestions', SuggestionController::class);
        Route::get('/rooms/{room}/autocomplete', AutocompleteController::class)->middleware('throttle:autocomplete');
        Route::post('/rooms/{room}/queue', [QueueController::class, 'store']);
        Route::delete('/rooms/{room}/queue/{item}', [QueueController::class, 'destroy']);
        Route::post('/rooms/{room}/playback/skip', [PlaybackController::class, 'skip']);
    });

    // What the display's player actually did.
    Route::middleware('ability:display')->group(function () {
        Route::post('/rooms/{room}/playback/started', [PlaybackController::class, 'started']);
        Route::post('/rooms/{room}/playback/ended', [PlaybackController::class, 'ended']);
    });
});
