<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('room-create', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));

        // Shared by code lookup and join: caps how fast one client can guess codes.
        RateLimiter::for('room-code', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
    }
}
