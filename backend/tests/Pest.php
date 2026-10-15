<?php

use App\Models\Participant;
use App\Models\Room;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
 // ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Act as a device holding the given bearer token. The auth guards are reset
 * first so a test can switch between several devices' tokens.
 */
function asDevice(string $token): TestCase
{
    app('auth')->forgetGuards();

    return test()->withToken($token);
}

/** Create a participant and return [participant, plain-text token]. */
function deviceIn(Room $room, string $role = 'guest'): array
{
    $participant = Participant::factory()->for($room)->{$role}()->create();

    return [$participant, $participant->issueToken()];
}

/** Fake the YouTube Data API: every requested video id exists and is embeddable. */
function fakeYouTube(): void
{
    config(['services.youtube.key' => 'test-key']);

    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => [
            ['id' => ['videoId' => 'aaaaaaaaaaa']],
            ['id' => ['videoId' => 'bbbbbbbbbbb']],
        ]]),
        'www.googleapis.com/youtube/v3/videos*' => function (Request $request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return Http::response(['items' => array_map(fn ($id) => [
                'id' => $id,
                'snippet' => [
                    'title' => "Song {$id} (Karaoke Version)",
                    'channelTitle' => 'Sing King',
                    'thumbnails' => ['medium' => ['url' => "https://i.ytimg.com/vi/{$id}/mqdefault.jpg"]],
                ],
                'contentDetails' => ['duration' => 'PT3M52S'],
                'status' => ['embeddable' => true],
            ], explode(',', $query['id']))]);
        },
        'itunes.apple.com/*' => Http::response(['results' => []]),
    ]);
}

/** Add a song as the given device and return its queue item id. */
function addSong(Room $room, string $token, string $videoId = 'aaaaaaaaaaa'): int
{
    return asDevice($token)
        ->postJson("/api/rooms/{$room->id}/queue", ['youtube_video_id' => $videoId])
        ->assertCreated()
        ->json('data.id');
}
