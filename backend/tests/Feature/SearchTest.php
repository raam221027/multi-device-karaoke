<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [, $this->hostToken] = deviceIn($this->room, 'host');
    [, $this->guestToken] = deviceIn($this->room, 'guest');
});

it('returns embeddable karaoke results with durations', function () {
    fakeYouTube();

    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/search?q=ABBA")
        ->assertOk()
        ->assertJsonCount(2, 'results')
        ->assertJsonPath('results.0.id', 'aaaaaaaaaaa')
        ->assertJsonPath('results.0.duration_seconds', 232);

    Http::assertSent(fn ($r) => str_contains($r->url(), '/search') && str_contains(urldecode($r->url()), 'abba karaoke'));
});

it('names the song, not the band, in results', function () {
    config(['services.youtube.key' => 'test-key']);
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'aaaaaaaaaaa']]]]),
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => [
            ['id' => 'aaaaaaaaaaa', 'snippet' => ['title' => 'Pagsubok - Orient Pearl (Karaoke)'], 'contentDetails' => ['duration' => 'PT3M39S']],
        ]]),
        'itunes.apple.com/*' => Http::response(['results' => [['trackName' => 'Pagsubok', 'artistName' => 'Orient Pearl']]]),
    ]);

    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/search?q=Pagsubok")
        ->assertOk()
        ->assertJsonPath('results.0.song_title', 'Pagsubok')
        ->assertJsonPath('results.0.artist', 'Orient Pearl');
});

it('caches results by normalized query', function () {
    fakeYouTube();

    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/search?q=ABBA")->assertOk();
    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/search?q=%20abba%20")->assertOk();

    Http::assertSentCount(2); // one search.list + one videos.list
});

it('explains when search is not configured', function () {
    config(['services.youtube.key' => null]);

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/search?q=ABBA")
        ->assertStatus(503);
});

it('limits searches per participant', function () {
    fakeYouTube();

    foreach (range(1, 10) as $i) {
        asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/search?q=song{$i}")->assertOk();
    }

    asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/search?q=song11")->assertTooManyRequests();
});

/** Fake a search returning these videos, in this order. */
function fakeSearchResults(array $videos): void
{
    config(['services.youtube.key' => 'test-key']);
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => array_map(fn ($v) => ['id' => ['videoId' => $v['id']]], $videos)]),
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => $videos]),
        'itunes.apple.com/*' => Http::response(['results' => []]),
    ]);
}

function fakeVideo(string $id, string $channel, string $title, array $details = []): array
{
    return [
        'id' => $id,
        'snippet' => ['title' => $title, 'channelTitle' => $channel],
        'contentDetails' => ['duration' => 'PT3M30S', ...$details],
        'status' => ['embeddable' => true],
    ];
}

it('lists videos likely to play on the TV first', function () {
    fakeSearchResults([
        fakeVideo('vevo0000000', 'TaylorSwiftVEVO', 'Taylor Swift - Love Story', ['licensedContent' => true]),
        fakeVideo('region00000', 'Some Uploader', 'Love Story Karaoke', ['regionRestriction' => ['blocked' => ['US']]]),
        fakeVideo('agelimit000', 'Some Uploader', 'Love Story Karaoke', ['contentRating' => ['ytRating' => 'ytAgeRestricted']]),
        fakeVideo('singking000', 'Sing King', 'Taylor Swift - Love Story (Karaoke Version)'),
    ]);

    $results = asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/search?q=love+story")->assertOk()->json('results');

    expect(array_column($results, 'id'))->toBe(['singking000', 'region00000', 'vevo0000000'])
        ->and($results[0])->not->toHaveKeys(['licensed', 'restricted']);
});

it('puts a video that already played on a TV first', function () {
    fakeSearchResults([
        fakeVideo('singking000', 'Sing King', 'Love Story (Karaoke Version)'),
        fakeVideo('played00000', 'Some Uploader', 'Love Story'),
    ]);
    $search = fn () => asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/search?q=love+story")->json('results.0.id');

    expect($search())->toBe('singking000');

    app(App\Services\YouTube::class)->markPlayable('played00000');

    expect($search())->toBe('played00000');
    Http::assertSentCount(2); // The second search came from the cache.
});
