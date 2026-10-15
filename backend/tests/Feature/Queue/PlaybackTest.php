<?php

use App\Models\QueueItem;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    fakeYouTube();
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    [$this->display, $this->displayToken] = deviceIn($this->room, 'display');

    $this->first = addSong($this->room, $this->hostToken);
    $this->second = addSong($this->room, $this->guestToken, 'bbbbbbbbbbb');
});

it('skips to the next song once, even if the skip is repeated', function () {
    foreach ([1, 2] as $_) {
        asDevice($this->hostToken)
            ->postJson("/api/rooms/{$this->room->id}/playback/skip", ['queue_item_id' => $this->first])
            ->assertNoContent();
    }

    expect($this->room->fresh()->current_queue_item_id)->toBe($this->second)
        ->and(QueueItem::find($this->first)->status->value)->toBe('skipped')
        ->and(QueueItem::find($this->second)->status->value)->toBe('playing');
});

it('ignores a late "ended" for a song that was already skipped', function () {
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/playback/skip", ['queue_item_id' => $this->first]);

    asDevice($this->displayToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/ended", ['queue_item_id' => $this->first, 'reason' => 'ended'])
        ->assertNoContent();

    expect($this->room->fresh()->current_queue_item_id)->toBe($this->second);
});

it('advances when the display reports the end or an error', function () {
    asDevice($this->displayToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/ended", ['queue_item_id' => $this->first, 'reason' => 'error'])
        ->assertNoContent();

    expect(QueueItem::find($this->first)->status->value)->toBe('failed');

    asDevice($this->displayToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/ended", ['queue_item_id' => $this->second, 'reason' => 'ended']);

    expect(QueueItem::find($this->second)->status->value)->toBe('played')
        ->and($this->room->fresh()->current_queue_item_id)->toBeNull();
});

it('only lets guests skip when the host allows it', function () {
    asDevice($this->guestToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/skip", ['queue_item_id' => $this->first])
        ->assertForbidden();

    $this->room->update(['guests_can_skip' => true]);

    asDevice($this->guestToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/skip", ['queue_item_id' => $this->first])
        ->assertNoContent();
});

it('only lets the display report playback', function () {
    asDevice($this->hostToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/ended", ['queue_item_id' => $this->first, 'reason' => 'ended'])
        ->assertForbidden();
});

it('pauses and resumes, tracking paused time', function () {
    $this->freezeSecond();

    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/playback/pause")->assertNoContent();
    expect($this->room->fresh()->playback_status->value)->toBe('paused');

    $this->travel(30)->seconds();

    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/playback/resume")->assertNoContent();

    $room = $this->room->fresh();
    expect($room->playback_status->value)->toBe('playing')
        ->and($room->paused_seconds)->toBe(30)
        ->and($room->paused_at)->toBeNull();
});

it('does not let guests pause', function () {
    asDevice($this->guestToken)->postJson("/api/rooms/{$this->room->id}/playback/pause")->assertForbidden();
});
