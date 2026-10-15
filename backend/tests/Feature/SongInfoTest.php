<?php

use App\Models\Room;
use App\Services\SongInfo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/** Fake the iTunes catalogue: songs as [track, artist] pairs, plus known artist names. */
function fakeCatalogue(array $songs, array $artists = []): void
{
    Http::fake(['itunes.apple.com/*' => function (Request $request) use ($songs, $artists) {
        $entity = $request->data()['entity'] ?? null;

        return Http::response(['results' => $entity === 'musicArtist'
            ? array_map(fn ($name) => ['artistName' => $name], array_values(array_filter($artists, fn ($name) => strcasecmp($name, $request->data()['term']) === 0)))
            : array_map(fn ($pair) => ['trackName' => $pair[0], 'artistName' => $pair[1]], $songs)]);
    }]);
}

it('finds the song when the artist comes first', function () {
    fakeCatalogue([['My Sacrifice', 'Creed']]);

    expect(app(SongInfo::class)->identify('Creed - My Sacrifice [KARAOKE]'))
        ->toBe(['song' => 'My Sacrifice', 'artist' => 'Creed']);
});

it('finds the song when the song comes first', function () {
    fakeCatalogue([['Alapaap', 'Eraserheads'], ['Alapaap (Live)', 'Eraserheads']]);

    expect(app(SongInfo::class)->identify('Alapaap - ERASERHEADS (KARAOKE)'))
        ->toBe(['song' => 'Alapaap', 'artist' => 'ERASERHEADS']);
});

it('falls back to a known artist name when the song is not in the catalogue', function () {
    fakeCatalogue([], ['Rockstar 2']);

    expect(app(SongInfo::class)->identify('WALA PA RING IBA - Rockstar 2 (HD Karaoke)'))
        ->toBe(['song' => 'WALA PA RING IBA', 'artist' => 'Rockstar 2']);
});

it('gives up on titles it cannot place', function (string $title) {
    fakeCatalogue([]);

    expect(app(SongInfo::class)->identify($title))->toBeNull();
})->with(['YouTube Developers - IFrame API demo', 'Just A Song Title (Karaoke)', 'A - B - C']);

it('does not cache a failed lookup', function () {
    Http::fake(['itunes.apple.com/*' => Http::sequence()
        ->push(null, 500)
        ->push(['results' => [['trackName' => 'My Sacrifice', 'artistName' => 'Creed']]]),
    ]);

    expect(app(SongInfo::class)->identify('Creed - My Sacrifice'))->toBeNull();
    expect(app(SongInfo::class)->identify('Creed - My Sacrifice'))->toBe(['song' => 'My Sacrifice', 'artist' => 'Creed']);
});

it('stores the song and artist on queued songs', function () {
    config(['services.youtube.key' => 'test-key']);
    Http::fake([
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => [[
            'id' => 'aaaaaaaaaaa',
            'snippet' => ['title' => 'Alapaap - ERASERHEADS (KARAOKE)', 'channelTitle' => 'PRO music COVER', 'thumbnails' => []],
            'contentDetails' => ['duration' => 'PT4M10S'],
            'status' => ['embeddable' => true],
        ]]]),
        'itunes.apple.com/*' => Http::response(['results' => [['trackName' => 'Alapaap', 'artistName' => 'Eraserheads']]]),
    ]);
    $room = Room::factory()->create();
    [, $token] = deviceIn($room, 'host');

    asDevice($token)
        ->postJson("/api/rooms/{$room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
        ->assertCreated()
        ->assertJsonPath('data.title', 'Alapaap - ERASERHEADS (KARAOKE)')
        ->assertJsonPath('data.song_title', 'Alapaap')
        ->assertJsonPath('data.artist', 'ERASERHEADS');
});
