<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    $this->suggest = fn (string $q) => asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/autocomplete?q=".urlencode($q));
});

/** Fake the iTunes catalogue with [track, artist] pairs. */
function fakeTracks(array $tracks): void
{
    Http::fake(['itunes.apple.com/*' => Http::response([
        'results' => array_map(fn ($pair) => ['trackName' => $pair[0], 'artistName' => $pair[1]], $tracks),
    ])]);
}

it('suggests matching artists first, then songs', function () {
    fakeTracks([
        ['Alapaap', 'Eraserheads'],
        ['Alapaap (Live)', 'Eraserheads'],
        ['Ang Huling El Bimbo', 'Eraserheads'],
        ['Alapaap', 'Cover Band'],
    ]);

    ($this->suggest)('eraser')->assertOk()->assertJsonPath('suggestions', [
        ['type' => 'artist', 'label' => 'Eraserheads', 'query' => 'Eraserheads'],
        ['type' => 'song', 'label' => 'Alapaap', 'artist' => 'Eraserheads', 'query' => 'Alapaap Eraserheads'],
        ['type' => 'song', 'label' => 'Ang Huling El Bimbo', 'artist' => 'Eraserheads', 'query' => 'Ang Huling El Bimbo Eraserheads'],
        ['type' => 'song', 'label' => 'Alapaap', 'artist' => 'Cover Band', 'query' => 'Alapaap Cover Band'],
    ]);
});

it('keeps the list short and caches it', function () {
    fakeTracks(array_map(fn ($i) => ["Song {$i}", "Artist {$i}"], range(1, 20)));

    ($this->suggest)('song')->assertOk()->assertJsonCount(8, 'suggestions');
    ($this->suggest)('Song ')->assertOk()->assertJsonCount(8, 'suggestions');

    Http::assertSentCount(1);
});

it('returns nothing when iTunes is down, and tries again next time', function () {
    Http::fake(['itunes.apple.com/*' => Http::sequence()->push([], 503)->push(['results' => [['trackName' => 'Alapaap', 'artistName' => 'Eraserheads']]])]);

    ($this->suggest)('alap')->assertOk()->assertJsonPath('suggestions', []);
    ($this->suggest)('alap')->assertOk()->assertJsonCount(1, 'suggestions');
});

it('needs at least two characters', function () {
    ($this->suggest)('a')->assertUnprocessable();
});

it('is for phones, not the TV', function () {
    [, $displayToken] = deviceIn($this->room, 'display');

    asDevice($displayToken)->getJson("/api/rooms/{$this->room->id}/autocomplete?q=alap")->assertForbidden();
});
