<?php

namespace App\Services;

use App\Enums\PlaybackStatus;
use App\Enums\QueueItemStatus;
use App\Models\Participant;
use App\Models\QueueItem;
use App\Models\Room;
use Illuminate\Support\Facades\DB;

/**
 * Every queue and playback change happens here, inside a transaction that
 * locks the room row first, so concurrent requests apply one at a time.
 */
class QueueService
{
    /** Append a song. If nothing is playing, it starts right away. */
    public function add(Room $room, Participant $by, array $video): QueueItem
    {
        return $this->locked($room, function (Room $room) use ($by, $video) {
            $item = $room->queueItems()->create([
                'added_by_participant_id' => $by->id,
                'youtube_video_id' => $video['id'],
                'title' => $video['title'],
                'song_title' => $video['song_title'] ?? null,
                'artist' => $video['artist'] ?? null,
                'channel_title' => $video['channel_title'],
                'thumbnail_url' => $video['thumbnail_url'],
                'duration_seconds' => $video['duration_seconds'],
                'position' => ((int) $room->queueItems()->max('position')) + 1,
            ]);

            if ($room->current_queue_item_id === null) {
                $this->startNext($room);
            }

            return $item->refresh();
        });
    }

    /** Take a waiting song out of the queue. A song that is playing is skipped instead. */
    public function remove(Room $room, QueueItem $item): void
    {
        $this->locked($room, function (Room $room) use ($item) {
            $updated = $room->queueItems()
                ->whereKey($item->id)
                ->where('status', QueueItemStatus::Queued)
                ->update(['status' => QueueItemStatus::Removed, 'ended_at' => now()]);

            abort_if($updated === 0, 409, 'That song is no longer waiting in the queue.');
        });
    }

    /** Remove every waiting song added by a participant (used when they are removed). */
    public function removeAllBy(Room $room, Participant $participant): void
    {
        $this->locked($room, function (Room $room) use ($participant) {
            $room->queueItems()
                ->where('added_by_participant_id', $participant->id)
                ->where('status', QueueItemStatus::Queued)
                ->update(['status' => QueueItemStatus::Removed, 'ended_at' => now()]);
        });
    }

    /**
     * Put the waiting songs in the given order. The ids must be exactly the
     * songs currently waiting, so a stale client can't drop or resurrect one.
     *
     * @param  list<int>  $itemIds
     */
    public function reorder(Room $room, array $itemIds): void
    {
        $this->locked($room, function (Room $room) use ($itemIds) {
            $waiting = $room->upcoming()->pluck('id')->all();

            abort_unless(
                count($itemIds) === count($waiting) && empty(array_diff($waiting, $itemIds)),
                409,
                'The queue changed while you were reordering. Try again.',
            );

            $base = (int) $room->queueItems()->max('position');
            foreach (array_values($itemIds) as $i => $id) {
                $room->queueItems()->whereKey($id)->update(['position' => $base + $i + 1]);
            }
        });
    }

    /**
     * Finish the current song and start the next one. Requests name the song
     * they mean, so a repeated or late skip/ended for an old song does nothing.
     */
    public function advance(Room $room, int $expectedItemId, QueueItemStatus $endStatus): void
    {
        $this->locked($room, function (Room $room) use ($expectedItemId, $endStatus) {
            if ($room->current_queue_item_id !== $expectedItemId) {
                return false;
            }

            $room->queueItems()->whereKey($expectedItemId)->update([
                'status' => $endStatus,
                'ended_at' => now(),
            ]);

            $this->startNext($room);
        });
    }

    /** The display reports that the video really started, so elapsed time is accurate. */
    public function markStarted(Room $room, int $expectedItemId): void
    {
        $this->locked($room, function (Room $room) use ($expectedItemId) {
            if ($room->current_queue_item_id !== $expectedItemId) {
                return false;
            }

            $room->queueItems()->whereKey($expectedItemId)->update(['started_at' => now()]);
            $room->forceFill(['paused_seconds' => 0, 'paused_at' => $room->paused_at ? now() : null])->save();
        });
    }

    public function pause(Room $room): void
    {
        $this->locked($room, function (Room $room) {
            if ($room->playback_status === PlaybackStatus::Paused) {
                return false;
            }

            $room->forceFill(['playback_status' => PlaybackStatus::Paused, 'paused_at' => now()])->save();
        });
    }

    public function resume(Room $room): void
    {
        $this->locked($room, function (Room $room) {
            if ($room->playback_status === PlaybackStatus::Playing) {
                return false;
            }

            $pausedFor = $room->paused_at ? (int) $room->paused_at->diffInSeconds(now(), true) : 0;

            $room->forceFill([
                'playback_status' => PlaybackStatus::Playing,
                'paused_at' => null,
                'paused_seconds' => $room->paused_seconds + $pausedFor,
            ])->save();
        });
    }

    private function startNext(Room $room): void
    {
        $next = $room->upcoming()->first();

        $next?->update(['status' => QueueItemStatus::Playing, 'started_at' => now()]);

        $room->forceFill([
            'current_queue_item_id' => $next?->id,
            'playback_status' => PlaybackStatus::Playing,
            'paused_at' => null,
            'paused_seconds' => 0,
        ])->save();
    }

    /**
     * Run a change with the room row locked. The callback returns false when
     * nothing changed; otherwise the room's version is bumped.
     *
     * @template T
     *
     * @param  callable(Room): T  $change
     * @return T
     */
    private function locked(Room $room, callable $change): mixed
    {
        return DB::transaction(function () use ($room, $change) {
            $locked = Room::whereKey($room->id)->lockForUpdate()->firstOrFail();

            abort_unless($locked->isOpen(), 410, 'This room has closed.');

            $result = $change($locked);

            if ($result !== false) {
                $locked->bumpVersion();
            }

            return $result;
        });
    }
}
