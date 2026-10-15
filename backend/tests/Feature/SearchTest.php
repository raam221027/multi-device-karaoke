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
