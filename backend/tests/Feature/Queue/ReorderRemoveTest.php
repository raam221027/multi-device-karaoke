<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    fakeYouTube();
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    [$this->other, $this->otherToken] = deviceIn($this->room, 'guest');

    addSong($this->room, $this->hostToken); // starts playing
    $this->a = addSong($this->room, $this->guestToken);
    $this->b = addSong($this->room, $this->otherToken, 'bbbbbbbbbbb');
    $this->c = addSong($this->room, $this->hostToken);
});

it('lets the host reorder waiting songs', function () {
    asDevice($this->hostToken)
        ->putJson("/api/rooms/{$this->room->id}/queue/order", ['item_ids' => [$this->c, $this->a, $this->b]])
        ->assertNoContent();

    $ids = asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/state")->json('queue.upcoming.*.id');
    expect($ids)->toBe([$this->c, $this->a, $this->b]);
});

it('rejects a reorder from a stale queue', function () {
    asDevice($this->hostToken)
        ->putJson("/api/rooms/{$this->room->id}/queue/order", ['item_ids' => [$this->a, $this->b]])
        ->assertConflict();
});

it('does not let guests reorder', function () {
    asDevice($this->guestToken)
        ->putJson("/api/rooms/{$this->room->id}/queue/order", ['item_ids' => [$this->c, $this->a, $this->b]])
        ->assertForbidden();
});

it('lets a guest remove only their own song', function () {
    asDevice($this->guestToken)->deleteJson("/api/rooms/{$this->room->id}/queue/{$this->b}")->assertForbidden();
    asDevice($this->guestToken)->deleteJson("/api/rooms/{$this->room->id}/queue/{$this->a}")->assertNoContent();
});

it("lets the host remove anyone's song", function () {
    asDevice($this->hostToken)->deleteJson("/api/rooms/{$this->room->id}/queue/{$this->b}")->assertNoContent();

    $ids = asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/state")->json('queue.upcoming.*.id');
    expect($ids)->toBe([$this->a, $this->c]);
});
