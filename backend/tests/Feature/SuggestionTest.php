<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
});

it('still loads without a YouTube key', function () {
    config(['services.youtube.key' => null]);

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/suggestions")
        ->assertOk()
        ->assertJsonPath('popular', [])
        ->assertJsonPath('pages', 1);
});

it('pages through the popular songs and wraps around', function () {
    config(['services.youtube.key' => 'test-key', 'services.youtube.popular_searches' => ['OPM karaoke hits']]);
    $ids = array_map(fn ($i) => sprintf('video%06d', $i), range(1, 15));
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => array_map(fn ($id) => ['id' => ['videoId' => $id]], $ids)]),
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => array_map(fn ($id) => [
            'id' => $id, 'snippet' => ['title' => "Song {$id} (Karaoke)"], 'contentDetails' => ['duration' => 'PT4M'],
        ], $ids)]),
        'itunes.apple.com/*' => Http::response(['results' => []]),
    ]);

    $page = fn ($n) => asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/suggestions?page={$n}")->assertOk();

    $page(0)->assertJsonPath('popular.*.id', array_slice($ids, 0, 12))->assertJsonPath('page', 0)->assertJsonPath('pages', 2);
    $page(1)->assertJsonPath('popular.*.id', array_slice($ids, 12))->assertJsonPath('page', 1);
    $page(2)->assertJsonPath('popular.*.id', array_slice($ids, 0, 12))->assertJsonPath('page', 0);
});

it('shares popular karaoke songs between rooms and caches them for a week', function () {
    config(['services.youtube.popular_searches' => ['OPM karaoke hits', 'greatest karaoke songs']]);
    fakeYouTube();

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/suggestions")
        ->assertOk()
        ->assertJsonPath('popular.*.id', ['aaaaaaaaaaa', 'bbbbbbbbbbb']);

    $other = Room::factory()->create();
    [, $otherToken] = deviceIn($other, 'guest');
    asDevice($otherToken)->getJson("/api/rooms/{$other->id}/suggestions")->assertOk()->assertJsonCount(2, 'popular');

    // Two searches (search.list + videos.list each) for the first visit only.
    Http::assertSentCount(4);
});

it('keeps popular songs to single songs', function () {
    config(['services.youtube.key' => 'test-key', 'services.youtube.popular_searches' => ['OPM karaoke hits']]);
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'aaaaaaaaaaa']]]]),
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => [
            ['id' => 'aaaaaaaaaaa', 'snippet' => ['title' => 'Nonstop OPM Karaoke'], 'contentDetails' => ['duration' => 'PT1H2M']],
            ['id' => 'bbbbbbbbbbb', 'snippet' => ['title' => 'Alapaap - Eraserheads (Karaoke)'], 'contentDetails' => ['duration' => 'PT4M10S']],
            ['id' => 'ccccccccccc', 'snippet' => ['title' => 'OPM LOVE SONG MEDLEY KARAOKE'], 'contentDetails' => ['duration' => 'PT5M15S']],
            ['id' => 'ddddddddddd', 'snippet' => ['title' => 'Top 10 Best Songs for Karaoke'], 'contentDetails' => ['duration' => 'PT9M']],
            ['id' => 'eeeeeeeeeee', 'snippet' => ['title' => 'Guess the song #shorts #karaoke'], 'contentDetails' => ['duration' => 'PT1M49S']],
        ]]),
    ]);

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/suggestions")
        ->assertOk()
        ->assertJsonPath('popular.*.id', ['bbbbbbbbbbb']);
});

it('does not cache popular songs when YouTube fails', function () {
    config(['services.youtube.popular_searches' => ['OPM karaoke hits']]);
    $down = true;
    Http::fake(['www.googleapis.com/*' => function () use (&$down) {
        if ($down) {
            return Http::response(null, 500);
        }
    }]);
    fakeYouTube(); // Answers once the outage above stops matching.

    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/suggestions")->assertOk()->assertJsonPath('popular', []);

    $down = false;
    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/suggestions")->assertOk()->assertJsonCount(2, 'popular');
});

it('names the song, not the band, in popular songs', function () {
    config(['services.youtube.key' => 'test-key', 'services.youtube.popular_searches' => ['OPM karaoke hits']]);
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'aaaaaaaaaaa']]]]),
        'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => [
            ['id' => 'aaaaaaaaaaa', 'snippet' => ['title' => 'Pagsubok - Orient Pearl (Karaoke)'], 'contentDetails' => ['duration' => 'PT3M39S']],
        ]]),
        'itunes.apple.com/*' => Http::response(['results' => [['trackName' => 'Pagsubok', 'artistName' => 'Orient Pearl']]]),
    ]);

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/suggestions")
        ->assertOk()
        ->assertJsonPath('popular.0.song_title', 'Pagsubok')
        ->assertJsonPath('popular.0.artist', 'Orient Pearl');
});

it('is for phones, not the TV', function () {
    [, $displayToken] = deviceIn($this->room, 'display');

    asDevice($displayToken)->getJson("/api/rooms/{$this->room->id}/suggestions")->assertForbidden();
});
