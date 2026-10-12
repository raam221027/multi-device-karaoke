<?php

use App\Models\Participant;
use App\Models\Room;
use App\Support\RoomCode;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('creates a room with a host session', function () {
    $response = $this->postJson('/api/rooms', ['display_name' => '  Joemar  '])
        ->assertCreated()
        ->assertJsonPath('room.status', 'open')
        ->assertJsonPath('participant.role', 'host')
        ->assertJsonPath('participant.display_name', 'Joemar')
        ->assertJsonStructure(['room' => ['id', 'code', 'version'], 'participant' => ['id'], 'token']);

    expect(RoomCode::isValid($response->json('room.code')))->toBeTrue();

    $host = Participant::findOrFail($response->json('participant.id'));
    $token = $host->tokens()->sole();

    expect($token->abilities)->toBe(['host'])
        ->and($token->expires_at)->not->toBeNull();

    asDevice($response->json('token'))
        ->getJson("/api/rooms/{$response->json('room.id')}/state")
        ->assertOk()
        ->assertJsonPath('me.role', 'host');
});

it('requires a display name', function (mixed $name) {
    $this->postJson('/api/rooms', ['display_name' => $name])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('display_name');

    expect(Room::count())->toBe(0);
})->with(['', '   ', null, str_repeat('x', 31)]);

it('rate limits room creation per IP', function () {
    foreach (range(1, 10) as $_) {
        $this->postJson('/api/rooms', ['display_name' => 'Host'])->assertCreated();
    }

    $this->postJson('/api/rooms', ['display_name' => 'Host'])->assertTooManyRequests();
});
