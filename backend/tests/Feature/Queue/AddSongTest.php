<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    fakeYouTube();
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
});

it('lets the host sing: their song starts when the room is idle', function () {
    $version = $this->room->fresh()->version;

    asDevice($this->hostToken)
        ->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
        ->assertCreated()
        ->assertJsonPath('data.added_by.id', $this->host->id)
        ->assertJsonPath('data.title', 'Song aaaaaaaaaaa (Karaoke Version)')
        ->assertJsonPath('data.duration_seconds', 232)
        ->assertJsonPath('data.status', 'playing');

    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('queue.current.added_by.display_name', $this->host->display_name)
        ->assertJsonCount(0, 'queue.upcoming');

    expect($this->room->fresh()->version)->toBeGreaterThan($version);
});

it('queues songs behind the current one in order', function () {
    addSong($this->room, $this->hostToken);
    $second = addSong($this->room, $this->guestToken, 'bbbbbbbbbbb');

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('queue.upcoming.0.id', $second)
        ->assertJsonPath('queue.upcoming.0.status', 'queued');
});

it('blocks a guest whose song adding is turned off, but never the host', function () {
    $this->guest->update(['can_add_songs' => false]);

    asDevice($this->guestToken)
        ->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
        ->assertForbidden();

    addSong($this->room, $this->hostToken);
});

it('blocks guests when the room stops song additions, but never the host', function () {
    $this->room->update(['allow_song_additions' => false]);

    asDevice($this->guestToken)
        ->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
        ->assertForbidden();

    addSong($this->room, $this->hostToken);
});

it('rejects malformed video ids', function () {
    asDevice($this->guestToken)
        ->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'nope'])
        ->assertUnprocessable();
});

it('does not let the display add songs', function () {
    [, $displayToken] = deviceIn($this->room, 'display');

    asDevice($displayToken)
        ->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
        ->assertForbidden();
});
