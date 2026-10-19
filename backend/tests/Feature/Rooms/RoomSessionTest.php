<?php

use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
});

it('returns room state with approved participants', function () {
    Participant::factory()->for($this->room)->create(['status' => ParticipantStatus::Pending]);

    asDevice($this->guestToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertOk()
        ->assertJsonPath('room.code', $this->room->code)
        ->assertJsonPath('me.id', $this->guest->id)
        ->assertJsonCount(2, 'participants');

    expect($this->guest->fresh()->last_seen_at)->not->toBeNull();
});

it('requires a token for room state', function () {
    $this->getJson("/api/rooms/{$this->room->id}/state")->assertUnauthorized();
});

it('forbids participants from other rooms', function () {
    [, $outsiderToken] = deviceIn(Room::factory()->create());

    asDevice($outsiderToken)->getJson("/api/rooms/{$this->room->id}/state")->assertForbidden();
});

it('resumes a session via /me', function () {
    asDevice($this->hostToken)
        ->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('participant.id', $this->host->id)
        ->assertJsonPath('room.id', $this->room->id);
});

it('lets a guest leave without affecting others', function () {
    asDevice($this->guestToken)->postJson("/api/rooms/{$this->room->id}/leave")->assertNoContent();

    asDevice($this->guestToken)->getJson('/api/me')->assertUnauthorized();
    asDevice($this->hostToken)->getJson('/api/me')->assertOk();
});

it('drops a guest who left from the room, so rejoining does not list them twice', function () {
    asDevice($this->guestToken)->postJson("/api/rooms/{$this->room->id}/leave")->assertNoContent();

    expect($this->guest->refresh()->status)->toBe(ParticipantStatus::Left);
    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonCount(1, 'participants')
        ->assertJsonPath('participants.0.id', $this->host->id);
});

it('does not let the host leave (they close instead)', function () {
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/leave")->assertForbidden();
});

it('only lets the host close the room', function () {
    asDevice($this->guestToken)->postJson("/api/rooms/{$this->room->id}/close")->assertForbidden();

    expect($this->room->fresh()->isOpen())->toBeTrue();
});

it('does not let a host close another room', function () {
    [, $otherHostToken] = deviceIn(Room::factory()->create(), 'host');

    asDevice($otherHostToken)->postJson("/api/rooms/{$this->room->id}/close")->assertForbidden();
});

it('closes the room and revokes every session in it', function () {
    $version = $this->room->version;

    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/close")->assertNoContent();

    $room = $this->room->fresh();
    expect($room->isOpen())->toBeFalse()
        ->and($room->closed_at)->not->toBeNull()
        ->and($room->version)->toBe($version + 1);

    asDevice($this->guestToken)->getJson("/api/rooms/{$this->room->id}/state")->assertUnauthorized();
    asDevice($this->hostToken)->getJson('/api/me')->assertUnauthorized();

    $this->postJson('/api/rooms/join', ['code' => $room->code, 'display_name' => 'Late'])->assertNotFound();
});
