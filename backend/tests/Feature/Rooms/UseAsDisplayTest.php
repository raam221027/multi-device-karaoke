<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    $this->url = "/api/rooms/{$this->room->id}/use-as-display";
});

it('turns the guest phone itself into the display', function () {
    asDevice($this->guestToken)->postJson($this->url)->assertNoContent();

    expect(roleOf($this->guestToken, $this->room))->toBe('display')
        ->and($this->room->participants()->count())->toBe(2);

    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/state")->assertJsonPath('display_connected', true);
});

it('stays one participant through a later swap with the host', function () {
    asDevice($this->guestToken)->postJson($this->url)->assertNoContent();

    asDevice($this->hostToken)
        ->postJson("/api/rooms/{$this->room->id}/become-display", ['participant_id' => $this->guest->id])
        ->assertNoContent();

    expect(roleOf($this->guestToken, $this->room))->toBe('host')
        ->and(roleOf($this->hostToken, $this->room))->toBe('display');
});

it('replaces the current display', function () {
    [, $screenToken] = deviceIn($this->room, 'display');
    [$other, $otherToken] = deviceIn($this->room, 'guest');
    asDevice($otherToken)->postJson($this->url)->assertNoContent();

    asDevice($this->guestToken)->postJson($this->url)->assertNoContent();

    asDevice($screenToken)->getJson('/api/me')->assertUnauthorized();
    expect(roleOf($otherToken, $this->room))->toBe('guest');
});

it('is only for guests of this room', function () {
    [, $strangerToken] = deviceIn(Room::factory()->create(), 'guest');

    asDevice($this->hostToken)->postJson($this->url)->assertForbidden();
    asDevice($strangerToken)->postJson($this->url)->assertForbidden();
});
