<?php

use App\Models\Room;
use App\Services\YouTube;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [, $this->token] = deviceIn($this->room, 'guest');
    $this->search = fn (string $q) => asDevice($this->token)->getJson("/api/rooms/{$this->room->id}/search?q=".urlencode($q));
});

it('searches once for a song however it is typed', function () {
    fakeYouTube();

    foreach (['Alapaap', 'alapaap!', '  ALAPAAP ', 'Karaoke alapaap', 'alapaap karaoke'] as $typed) {
        ($this->search)($typed)->assertOk();
    }

    Http::assertSentCount(2); // one search.list + one videos.list
    Http::assertSent(fn ($r) => str_contains(urldecode($r->url()), 'q=alapaap karaoke'));
});

it('counts the units it spends and the searches the cache saved', function () {
    fakeYouTube();

    ($this->search)('Alapaap')->assertOk();
    ($this->search)('alapaap')->assertOk();

    expect(app(YouTube::class)->usage())->toMatchArray(['units' => 101, 'searches' => 1, 'hits' => 1, 'resting' => false]);
});

it('rests search before the daily quota runs out but keeps cached searches', function () {
    fakeYouTube();
    config(['services.youtube.daily_quota' => 300]);

    ($this->search)('song one')->assertOk(); // 101 units
    ($this->search)('song two')->assertOk(); // 202 units, at the 95% line next time

    ($this->search)('song three')->assertStatus(503)->assertJsonPath('message', YouTube::RESTING_MESSAGE);
    ($this->search)('song one')->assertOk();

    Http::assertSentCount(4);
});

it('rests search for the day when YouTube says the quota is used up', function () {
    config(['services.youtube.key' => 'test-key']);
    Http::fake([
        'www.googleapis.com/youtube/v3/search*' => Http::response(['error' => ['errors' => [['reason' => 'quotaExceeded']]]], 403),
    ]);

    ($this->search)('song one')->assertStatus(503)->assertJsonPath('message', YouTube::RESTING_MESSAGE);
    ($this->search)('song two')->assertStatus(503);

    Http::assertSentCount(1);
    expect(app(YouTube::class)->usage()['resting'])->toBeTrue();
});
