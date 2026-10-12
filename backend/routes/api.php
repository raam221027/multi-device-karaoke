<?php

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
