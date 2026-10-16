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

function makeHostUrl(Room $room, int $participantId): string
{
    return "/api/rooms/{$room->id}/participants/{$participantId}/make-host";
}

it('hands the room to a guest without new tokens', function () {
    $version = $this->room->version;

    asDevice($this->hostToken)->postJson(makeHostUrl($this->room, $this->guest->id))->assertNoContent();

    expect($this->guest->refresh()->isHost())->toBeTrue()
        ->and($this->host->refresh()->isGuest())->toBeTrue()
        ->and($this->room->refresh()->version)->toBeGreaterThan($version);

    // The same token now carries host rights.
    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('me.role', 'host');
    asDevice($this->guestToken)->patchJson("/api/rooms/{$this->room->id}", ['is_locked' => true])->assertOk();
});

it('keeps the old host in the room as a guest', function () {
    asDevice($this->hostToken)->postJson(makeHostUrl($this->room, $this->guest->id))->assertNoContent();

    asDevice($this->hostToken)->patchJson("/api/rooms/{$this->room->id}", ['is_locked' => true])->assertForbidden();
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/close")->assertForbidden();
    addSong($this->room, $this->hostToken);
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/leave")->assertNoContent();
});

it('only lets the host hand over the room', function () {
    [$other] = deviceIn($this->room, 'guest');

    asDevice($this->guestToken)->postJson(makeHostUrl($this->room, $other->id))->assertForbidden();
    asDevice($this->guestToken)->postJson(makeHostUrl($this->room, $this->guest->id))->assertForbidden();

    expect($this->host->refresh()->isHost())->toBeTrue();
});

it('does not make the display the host', function () {
    [$display] = deviceIn($this->room, 'display');

    asDevice($this->hostToken)->postJson(makeHostUrl($this->room, $display->id))->assertStatus(422);
    asDevice($this->hostToken)->postJson(makeHostUrl($this->room, $this->host->id))->assertStatus(422);
});

it('does not reach into another room', function () {
    [$stranger] = deviceIn(Room::factory()->create(), 'guest');

    asDevice($this->hostToken)->postJson(makeHostUrl($this->room, $stranger->id))->assertNotFound();
});
