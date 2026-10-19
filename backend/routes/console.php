<?php

use App\Models\Room;
use App\Services\YouTube;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('youtube:usage', function (YouTube $youtube) {
    $usage = $youtube->usage();
    $lookups = $usage['searches'] + $usage['hits'];

    $this->table(['Quota day (Pacific)', 'Units used', 'Daily quota', 'YouTube searches', 'Served from cache', 'Cache hit rate', 'Search resting'], [[
        $usage['day'],
        $usage['units'],
        config('services.youtube.daily_quota'),
        $usage['searches'],
        $usage['hits'],
        $lookups > 0 ? round($usage['hits'] / $lookups * 100).'%' : '-',
        $usage['resting'] ? 'yes' : 'no',
    ]]);
})->purpose('Show today\'s YouTube API quota use');

Artisan::command('rooms:prune', function () {
    $this->info('Deleted '.Room::pruneOld().' rooms older than '.Room::KEEP_DAYS.' days.');
})->purpose('Delete rooms (and their YouTube song details) closed or idle for 30 days');
