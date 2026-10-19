<?php

namespace App\Http\Controllers;

use App\Enums\QueueItemStatus;
use App\Models\Room;
use App\Services\AlternativeVideo;
use App\Services\QueueService;
use App\Services\YouTube;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Phones send commands (skip, pause, resume); the display reports what its
 * player did (started, ended, error). Advances name the song they mean.
 */
class PlaybackController extends Controller
{
    public function __construct(private QueueService $queue) {}

    public function skip(Request $request, Room $room): Response
    {
        $itemId = $this->itemId($request);
        Gate::authorize('skip', [$room, $room->queueItems()->find($itemId)]);

        $this->queue->advance($room, $itemId, QueueItemStatus::Skipped);

        return response()->noContent();
    }

    public function pause(Room $room): Response
    {
        Gate::authorize('manage', $room);

        $this->queue->pause($room);

        return response()->noContent();
    }

    public function resume(Room $room): Response
    {
        Gate::authorize('manage', $room);

        $this->queue->resume($room);

        return response()->noContent();
    }

    public function started(Request $request, Room $room, YouTube $youtube): Response
    {
        Gate::authorize('reportPlayback', $room);

        $itemId = $this->itemId($request);
        $this->queue->markStarted($room, $itemId);

        // It really plays on a TV, so searches rank it first from now on.
        if ($room->current_queue_item_id === $itemId && $item = $room->queueItems()->find($itemId)) {
            $youtube->markPlayable($item->youtube_video_id);
        }

        return response()->noContent();
    }

    /** Player error codes for "this video can't play here" (removed, or embedding refused by its owner). */
    private const UNPLAYABLE = [100, 101, 150];

    private const MAX_SWAPS = 2;

    public function ended(Request $request, Room $room, YouTube $youtube, AlternativeVideo $alternatives): Response
    {
        Gate::authorize('reportPlayback', $room);

        $data = $request->validate([
            'reason' => ['required', 'in:ended,error'],
            'code' => ['nullable', 'integer'],
            'video_id' => ['nullable', 'string'],
        ]);
        $itemId = $this->itemId($request);

        // A blocked upload shouldn't cost the singer their turn: try another
        // upload of the same song. Looked up before taking the room lock.
        // Reports name the video too, so a late one about a swapped-out video does nothing.
        if ($data['reason'] === 'error' && isset($data['video_id']) && in_array((int) ($data['code'] ?? 0), self::UNPLAYABLE, true)) {
            $item = $room->current_queue_item_id === $itemId ? $room->queueItems()->find($itemId) : null;
            if ($item?->youtube_video_id !== $data['video_id']) {
                return response()->noContent(); // About an old song or video.
            }

            $youtube->block($item->youtube_video_id);

            $video = $item->video_swaps < self::MAX_SWAPS ? $alternatives->find($item) : null;
            if ($video !== null) {
                $this->queue->replaceVideo($room, $itemId, $item->youtube_video_id, $video);

                return response()->noContent();
            }
        }

        $this->queue->advance(
            $room,
            $itemId,
            $data['reason'] === 'error' ? QueueItemStatus::Failed : QueueItemStatus::Played,
        );

        return response()->noContent();
    }

    private function itemId(Request $request): int
    {
        return (int) $request->validate(['queue_item_id' => ['required', 'integer']])['queue_item_id'];
    }
}
