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

it('names a new room after its host', function () {
    $this->postJson('/api/rooms', ['display_name' => 'Alex'])
        ->assertCreated()
        ->assertJsonPath('room.name', "Alex's Videokehan");
});

it('keeps a long host name within the room name limit', function () {
    $name = str_repeat('a', 30);

    $this->postJson('/api/rooms', ['display_name' => $name])
        ->assertCreated()
        ->assertJsonPath('room.name', str_repeat('a', 27)."'s Videokehan");
});

it('lets the host change room settings', function () {
    asDevice($this->hostToken)
        ->patchJson("/api/rooms/{$this->room->id}", [
            'name' => 'Rooftop',
            'is_locked' => true,
            'allow_song_additions' => false,
            'guests_can_skip' => true,
            'show_side_strip' => false,
        ])
        ->assertOk()
        ->assertJsonPath('data.name', 'Rooftop')
        ->assertJsonPath('data.is_locked', true)
        ->assertJsonPath('data.allow_song_additions', false)
        ->assertJsonPath('data.guests_can_skip', true)
        ->assertJsonPath('data.show_side_strip', false);
});

it('does not let guests change settings', function () {
    asDevice($this->guestToken)->patchJson("/api/rooms/{$this->room->id}", ['is_locked' => true])->assertForbidden();
});

it("lets the host turn a guest's song adding off", function () {
    asDevice($this->hostToken)
        ->patchJson("/api/rooms/{$this->room->id}/participants/{$this->guest->id}", ['can_add_songs' => false])
        ->assertOk()
        ->assertJsonPath('data.can_add_songs', false);
});

it('removes a guest: the session ends and their waiting songs go, the playing one stays', function () {
    $playing = addSong($this->room, $this->guestToken);
    addSong($this->room, $this->guestToken);
    $hostSong = addSong($this->room, $this->hostToken);

    asDevice($this->hostToken)
        ->deleteJson("/api/rooms/{$this->room->id}/participants/{$this->guest->id}")
        ->assertNoContent();

    asDevice($this->guestToken)->getJson('/api/me')->assertUnauthorized();

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('queue.current.id', $playing)
        ->assertJsonPath('queue.upcoming.0.id', $hostSong)
        ->assertJsonCount(1, 'queue.upcoming')
        ->assertJsonCount(1, 'participants');
});

it('does not let the host remove themselves', function () {
    asDevice($this->hostToken)
        ->deleteJson("/api/rooms/{$this->room->id}/participants/{$this->host->id}")
        ->assertUnprocessable();
});

it('connects a display by room code, replacing any previous one', function () {
    $first = $this->postJson('/api/rooms/display', ['code' => $this->room->code])
        ->assertCreated()
        ->assertJsonPath('participant.role', 'display')
        ->json('token');

    $second = $this->postJson('/api/rooms/display', ['code' => strtolower($this->room->code)])
        ->assertCreated()
        ->json('token');

    asDevice($first)->getJson('/api/me')->assertUnauthorized();
    asDevice($second)->getJson('/api/me')->assertOk();

    asDevice($this->hostToken)
        ->getJson("/api/rooms/{$this->room->id}/state")
        ->assertJsonPath('display_connected', true);
});

it('names the screen after its device', function () {
    $this->postJson('/api/rooms/display', ['code' => $this->room->code, 'device' => 'Tablet'])
        ->assertCreated()
        ->assertJsonPath('participant.device', 'Tablet')
        ->assertJsonPath('participant.display_name', 'Tablet');

    $this->postJson('/api/rooms/display', ['code' => $this->room->code])
        ->assertCreated()
        ->assertJsonPath('participant.device', 'Screen');

    $this->postJson('/api/rooms/display', ['code' => $this->room->code, 'device' => 'Toaster'])->assertUnprocessable();
});

it('does not connect a display to a locked room', function () {
    $this->room->update(['is_locked' => true]);

    $this->postJson('/api/rooms/display', ['code' => $this->room->code])->assertStatus(423);
});

it('lets the display leave', function () {
    [, $displayToken] = deviceIn($this->room, 'display');

    asDevice($displayToken)->postJson("/api/rooms/{$this->room->id}/leave")->assertNoContent();
});
