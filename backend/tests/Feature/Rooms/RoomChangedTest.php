<?php

use App\Events\RoomChanged;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    fakeYouTube();
    $this->room = Room::factory()->create();
    [$this->host, $this->hostToken] = deviceIn($this->room, 'host');
    [$this->guest, $this->guestToken] = deviceIn($this->room, 'guest');
    [$this->display, $this->displayToken] = deviceIn($this->room, 'display');
});

/** Sign broadcasts with Reverb's driver, so channel auth really checks the channel. */
function useReverb(array $options = []): void
{
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
        'broadcasting.connections.reverb.options' => $options + ['host' => '127.0.0.1', 'port' => 8080, 'scheme' => 'http', 'useTLS' => false],
    ]);

    // Channels were registered on the testing default broadcaster at boot.
    app(Illuminate\Broadcasting\BroadcastManager::class)->purge();
    require base_path('routes/channels.php');
}

function authorizeRoomChannel(string $token, Room $room): Illuminate\Testing\TestResponse
{
    return asDevice($token)->postJson('/broadcasting/auth', [
        'socket_id' => '1234.5678',
        'channel_name' => "private-room.{$room->id}",
    ]);
}

it('tells the room once a change is saved, with the new version', function () {
    Event::fake([RoomChanged::class]);

    addSong($this->room, $this->guestToken);
    asDevice($this->hostToken)->patchJson("/api/rooms/{$this->room->id}", ['guests_can_skip' => true])->assertOk();

    $version = $this->room->fresh()->version;
    Event::assertDispatched(RoomChanged::class, fn (RoomChanged $e) => $e->roomId === $this->room->id && $e->version === $version);
    expect($e = new RoomChanged($this->room->id, $version))
        ->and($e->broadcastOn()->name)->toBe("private-room.{$this->room->id}")
        ->and($e->broadcastAs())->toBe('room.changed')
        ->and($e->broadcastWith())->toBe(['version' => $version]);
});

it('stays quiet when nothing changed', function () {
    $first = addSong($this->room, $this->hostToken);
    addSong($this->room, $this->hostToken, 'bbbbbbbbbbb');
    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/playback/skip", ['queue_item_id' => $first]);

    Event::fake([RoomChanged::class]);

    // A late "ended" for the song that was already skipped.
    asDevice($this->displayToken)
        ->postJson("/api/rooms/{$this->room->id}/playback/ended", ['queue_item_id' => $first, 'reason' => 'ended'])
        ->assertNoContent();

    Event::assertNotDispatched(RoomChanged::class);
});

it('lets every device in the room listen', function () {
    useReverb();

    foreach ([$this->hostToken, $this->guestToken, $this->displayToken] as $token) {
        authorizeRoomChannel($token, $this->room)->assertOk()->assertJsonStructure(['auth']);
    }
});

it('keeps other rooms, removed guests and closed rooms off the channel', function () {
    useReverb();
    $other = Room::factory()->create();
    [, $outsiderToken] = deviceIn($other, 'guest');

    authorizeRoomChannel($outsiderToken, $this->room)->assertForbidden();

    asDevice($this->hostToken)->deleteJson("/api/rooms/{$this->room->id}/participants/{$this->guest->id}")->assertNoContent();
    expect(authorizeRoomChannel($this->guestToken, $this->room)->status())->toBeIn([401, 403]);

    asDevice($this->hostToken)->postJson("/api/rooms/{$this->room->id}/close")->assertSuccessful();
    expect(authorizeRoomChannel($this->displayToken, $this->room)->status())->toBeIn([401, 403]);
});

it('still saves the change when Reverb is unreachable', function () {
    // Nothing listens on port 1, so the broadcast fails.
    useReverb(['port' => 1]);

    addSong($this->room, $this->guestToken);

    expect($this->room->fresh()->current_queue_item_id)->not->toBeNull();
});
