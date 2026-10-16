<?php

use App\Models\QueueItem;
use App\Models\Room;
use App\Services\YouTube;
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

describe('a video whose owner blocks playback here', function () {
    beforeEach(function () {
        $this->report = fn (int $itemId, ?int $code = 150, string $videoId = 'aaaaaaaaaaa') => asDevice($this->displayToken)
            ->postJson("/api/rooms/{$this->room->id}/playback/ended", [
                'queue_item_id' => $itemId, 'video_id' => $videoId, 'reason' => 'error', 'code' => $code,
            ])
            ->assertNoContent();
    });

    it('swaps in another upload of the same song, keeping the turn', function () {
        $version = $this->room->fresh()->version;

        ($this->report)($this->first);

        $item = QueueItem::find($this->first);
        expect($this->room->fresh()->current_queue_item_id)->toBe($this->first)
            ->and($this->room->fresh()->version)->toBeGreaterThan($version)
            ->and($item->status->value)->toBe('playing')
            ->and($item->youtube_video_id)->toBe('bbbbbbbbbbb')
            ->and($item->video_swaps)->toBe(1);
    });

    it('hides the blocked video from search and the queue', function () {
        ($this->report)($this->first);

        asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/search?q=song")
            ->assertOk()->assertJsonCount(1, 'results')->assertJsonPath('results.0.id', 'bbbbbbbbbbb');
        asDevice($this->guestToken)->postJson("/api/rooms/{$this->room->id}/queue", ['youtube_video_id' => 'aaaaaaaaaaa'])
            ->assertUnprocessable();
    });

    it('swaps only once for a repeated report', function () {
        ($this->report)($this->first);
        ($this->report)($this->first); // A late repeat about the old video.

        $item = QueueItem::find($this->first);
        expect($item->video_swaps)->toBe(1)
            ->and($item->youtube_video_id)->toBe('bbbbbbbbbbb')
            ->and(app(YouTube::class)->isBlocked('bbbbbbbbbbb'))->toBeFalse();
    });

    it('skips the song when no other upload is found', function () {
        app(YouTube::class)->block('bbbbbbbbbbb');

        ($this->report)($this->first);

        expect(QueueItem::find($this->first)->status->value)->toBe('failed')
            ->and($this->room->fresh()->current_queue_item_id)->toBe($this->second);
    });

    it('gives up after two swaps', function () {
        QueueItem::whereKey($this->first)->update(['video_swaps' => 2]);

        ($this->report)($this->first);

        expect(QueueItem::find($this->first)->status->value)->toBe('failed')
            ->and($this->room->fresh()->current_queue_item_id)->toBe($this->second);
    });

    it('skips without searching for other player errors', function () {
        ($this->report)($this->first, 5);

        expect(QueueItem::find($this->first)->status->value)->toBe('failed')
            ->and(app(YouTube::class)->isBlocked('aaaaaaaaaaa'))->toBeFalse();
    });
});

it('remembers videos that really started on the TV', function () {
    asDevice($this->displayToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/started", ['queue_item_id' => $this->first])
        ->assertNoContent();

    expect(app(YouTube::class)->isPlayable('aaaaaaaaaaa'))->toBeTrue()
        ->and(app(YouTube::class)->isPlayable('bbbbbbbbbbb'))->toBeFalse();
});
