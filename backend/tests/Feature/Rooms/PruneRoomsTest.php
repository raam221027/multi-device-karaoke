<?php

use App\Models\QueueItem;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;

uses(RefreshDatabase::class);

beforeEach(fn () => fakeYouTube());

/** A room with a host, a guest and a song playing, last touched $daysAgo days ago. */
function roomFrom(int $daysAgo, bool $closed): Room
{
    $room = Room::factory()->create();
    [, $hostToken] = deviceIn($room, 'host');
    deviceIn($room, 'guest');
    addSong($room, $hostToken);

    $at = now()->subDays($daysAgo);
    $room->forceFill(['updated_at' => $at, 'closed_at' => $closed ? $at : null, 'status' => $closed ? 'closed' : 'open'])->saveQuietly();

    return $room;
}

it('deletes rooms closed or idle for over 30 days, with their songs and tokens', function () {
    $closedLongAgo = roomFrom(31, closed: true);
    $idleLongAgo = roomFrom(40, closed: false);
    $closedRecently = roomFrom(5, closed: true);
    $activeToday = roomFrom(0, closed: false);

    $this->artisan('rooms:prune')->assertSuccessful();

    expect(Room::pluck('id')->all())->toEqualCanonicalizing([$closedRecently->id, $activeToday->id])
        ->and(QueueItem::whereIn('room_id', [$closedLongAgo->id, $idleLongAgo->id])->count())->toBe(0)
        ->and(QueueItem::count())->toBe(2)
        ->and(PersonalAccessToken::count())->toBe(4);
});

it('tidies up old rooms when someone creates a room, at most once an hour', function () {
    $old = roomFrom(31, closed: true);

    $this->postJson('/api/rooms', ['display_name' => 'Ana'])->assertCreated();
    expect(Room::find($old->id))->toBeNull();

    $older = roomFrom(45, closed: true);
    $this->postJson('/api/rooms', ['display_name' => 'Ben'])->assertCreated();
    expect(Room::find($older->id))->not->toBeNull();
});
