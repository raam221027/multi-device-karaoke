<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    $this->url = "/api/rooms/{$this->room->id}/become-display";
});

function roleOf(string $token, Room $room): string
{
    return asDevice($token)->getJson("/api/rooms/{$room->id}/state")->assertOk()->json('me.role');
}

it('hands host to a guest and keeps both devices connected', function () {
    [$oldDisplay, $oldDisplayToken] = deviceIn($this->room, 'display');

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->guest->id])->assertNoContent();

    // Same tokens, new roles: nobody has to reconnect.
    expect(roleOf($this->guestToken, $this->room))->toBe('host')
        ->and(roleOf($this->hostToken, $this->room))->toBe('display');

    asDevice($this->guestToken)->patchJson("/api/rooms/{$this->room->id}", ['is_locked' => true])->assertOk();
    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/state")->assertJsonPath('display_connected', true);

    // The old screen is replaced.
    asDevice($oldDisplayToken)->getJson('/api/me')->assertUnauthorized();
    expect($oldDisplay->refresh()->isApproved())->toBeFalse();
});

it('swaps the host and the screen', function () {
    [$display, $displayToken] = deviceIn($this->room, 'display');

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $display->id])->assertNoContent();

    expect(roleOf($displayToken, $this->room))->toBe('host')
        ->and(roleOf($this->hostToken, $this->room))->toBe('display')
        ->and($display->refresh()->can_add_songs)->toBeTrue()
        ->and($display->display_name)->toBe('PC')
        ->and($display->device)->toBeNull();

    // And back again, still without anyone reconnecting.
    asDevice($displayToken)->postJson($this->url, ['participant_id' => $this->host->id])->assertNoContent();

    expect(roleOf($this->hostToken, $this->room))->toBe('host')
        ->and(roleOf($displayToken, $this->room))->toBe('display');
});

it('sends a phone that was the display back to being a guest', function () {
    [$other, $otherToken] = deviceIn($this->room, 'guest');
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/participants/{$other->id}/make-display")->assertNoContent();

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->guest->id])->assertNoContent();

    expect(roleOf($otherToken, $this->room))->toBe('guest')
        ->and(roleOf($this->hostToken, $this->room))->toBe('display');
});

it('keeps the old host\'s name on their queued songs', function () {
    fakeYouTube();
    addSong($this->room, $this->hostToken);

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->guest->id])->assertNoContent();

    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('queue.current.added_by.display_name', $this->host->display_name);
});

it('works while the room is locked', function () {
    $this->room->update(['is_locked' => true]);

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->guest->id])->assertNoContent();
});

it('needs someone else to take over', function () {
    [$stranger] = deviceIn(Room::factory()->create(), 'guest');

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->host->id])->assertStatus(422);
    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $stranger->id])->assertNotFound();
    asDevice($this->hostToken)->postJson($this->url, [])->assertUnprocessable();

    expect($this->host->refresh()->isHost())->toBeTrue();
});

it('is only for the host', function () {
    [$other] = deviceIn($this->room, 'guest');

    asDevice($this->guestToken)->postJson($this->url, ['participant_id' => $other->id])->assertForbidden();
});

it('does not hand host to a guest with no device behind them', function () {
    $this->guest->tokens()->delete();

    asDevice($this->hostToken)->postJson($this->url, ['participant_id' => $this->guest->id])->assertStatus(422);
    expect(roleOf($this->hostToken, $this->room))->toBe('host');
});
