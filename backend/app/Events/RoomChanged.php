<?php

namespace App\Events;

use App\Models\Room;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Support\Facades\DB;

/**
 * Tells a room's devices that its state changed, so they re-fetch it. It
 * carries only the new version, never room data: a device whose session was
 * revoked may still be subscribed, and its next fetch ends that session.
 */
class RoomChanged implements ShouldBroadcastNow
{
    public function __construct(public int $roomId, public int $version) {}

    /**
     * Signal the room once the current transaction commits, so devices never
     * re-fetch a state that isn't saved yet. If Reverb is down the change still
     * goes through; devices keep polling and catch up.
     */
    public static function afterCommit(int $roomId): void
    {
        DB::afterCommit(function () use ($roomId) {
            $version = Room::whereKey($roomId)->value('version');

            if ($version !== null) {
                rescue(fn () => event(new self($roomId, (int) $version)));
            }
        });
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel("room.{$this->roomId}");
    }

    public function broadcastAs(): string
    {
        return 'room.changed';
    }

    public function broadcastWith(): array
    {
        return ['version' => $this->version];
    }
}
