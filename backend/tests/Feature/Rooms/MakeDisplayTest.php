<?php

use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    $this->url = fn ($participant) => "/api/rooms/{$this->room->id}/participants/{$participant->id}/make-display";
});

it('turns a guest phone into the display without reconnecting', function () {
    asDevice($this->hostToken)->postJson(($this->url)($this->guest))->assertNoContent();

    expect(roleOf($this->guestToken, $this->room))->toBe('display')
        ->and(roleOf($this->hostToken, $this->room))->toBe('host');

    asDevice($this->hostToken)->getJson("/api/rooms/{$this->room->id}/state")->assertJsonPath('display_connected', true);
});

it('disconnects a screen that joined by code', function () {
    [$screen, $screenToken] = deviceIn($this->room, 'display');

    asDevice($this->hostToken)->postJson(($this->url)($this->guest))->assertNoContent();

    asDevice($screenToken)->getJson('/api/me')->assertUnauthorized();
    expect($screen->refresh()->isApproved())->toBeFalse();
});

it('sends a phone that was the display back to being a guest', function () {
    [$other, $otherToken] = deviceIn($this->room, 'guest');
    asDevice($this->hostToken)->postJson(($this->url)($this->guest))->assertNoContent();

    asDevice($this->hostToken)->postJson(($this->url)($other))->assertNoContent();

    expect(roleOf($otherToken, $this->room))->toBe('display')
        ->and(roleOf($this->guestToken, $this->room))->toBe('guest');
});

it('only takes a guest of this room', function () {
    [$screen] = deviceIn($this->room, 'display');
    [$stranger] = deviceIn(Room::factory()->create(), 'guest');

    asDevice($this->hostToken)->postJson(($this->url)($this->host))->assertStatus(422);
    asDevice($this->hostToken)->postJson(($this->url)($screen))->assertStatus(422);
    asDevice($this->hostToken)->postJson(($this->url)($stranger))->assertNotFound();
});

it('is only for the host', function () {
    [$other] = deviceIn($this->room, 'guest');

    asDevice($this->guestToken)->postJson(($this->url)($other))->assertForbidden();
});

it('does not make a guest with no device behind them the display', function () {
    $this->guest->tokens()->delete();

    asDevice($this->hostToken)->postJson(($this->url)($this->guest))->assertStatus(422);
    expect($this->guest->refresh()->isGuest())->toBeTrue();
});
