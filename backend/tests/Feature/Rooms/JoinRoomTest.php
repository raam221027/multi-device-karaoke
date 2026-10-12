<?php

use App\Models\Participant;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('previews an open room by code', function () {
    $room = Room::factory()->create(['code' => 'ABCD23']);

    $this->getJson('/api/rooms/code/abcd-23')
        ->assertOk()
        ->assertJson(['id' => $room->id, 'code' => 'ABCD23', 'joinable' => true]);
});

it('previews a locked room as not joinable', function () {
    Room::factory()->locked()->create(['code' => 'ABCD23']);

    $this->getJson('/api/rooms/code/ABCD23')
        ->assertOk()
        ->assertJson(['joinable' => false, 'is_locked' => true]);
});

it('hides unknown, malformed and closed codes', function (string $code) {
    Room::factory()->closed()->create(['code' => 'CXSD23']);

    $this->getJson("/api/rooms/code/{$code}")->assertNotFound();
})->with(['ZZZZ22', 'nope', 'CXSD23']);

it('joins with a typed code and returns a guest session', function () {
    $room = Room::factory()->create(['code' => 'ABCD23']);

    $response = $this->postJson('/api/rooms/join', ['code' => 'abcd-23', 'display_name' => 'Ana'])
        ->assertCreated()
        ->assertJsonPath('room.id', $room->id)
        ->assertJsonPath('participant.role', 'guest')
        ->assertJsonPath('participant.status', 'approved')
        ->assertJsonPath('room.version', 1);

    $guest = Participant::findOrFail($response->json('participant.id'));
    expect($guest->tokens()->sole()->abilities)->toBe(['guest']);
});

it('refuses to join an unknown or closed room', function () {
    Room::factory()->closed()->create(['code' => 'CXSD23']);

    $this->postJson('/api/rooms/join', ['code' => 'CXSD23', 'display_name' => 'Ana'])->assertNotFound();
    $this->postJson('/api/rooms/join', ['code' => 'ZZZZ22', 'display_name' => 'Ana'])->assertNotFound();
});

it('refuses to join a locked room', function () {
    Room::factory()->locked()->create(['code' => 'ABCD23']);

    $this->postJson('/api/rooms/join', ['code' => 'ABCD23', 'display_name' => 'Ana'])->assertStatus(423);

    expect(Participant::count())->toBe(0);
});

it('validates the join payload', function () {
    $this->postJson('/api/rooms/join', ['code' => 'ABC', 'display_name' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code', 'display_name']);
});

it('rate limits code guessing per IP', function () {
    foreach (range(1, 20) as $_) {
        $this->postJson('/api/rooms/join', ['code' => 'ZZZZ22', 'display_name' => 'Eve'])->assertNotFound();
    }

    $this->postJson('/api/rooms/join', ['code' => 'ZZZZ22', 'display_name' => 'Eve'])->assertTooManyRequests();
    $this->getJson('/api/rooms/code/ZZZZ22')->assertTooManyRequests();
});
