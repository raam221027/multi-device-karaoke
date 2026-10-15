<?php

namespace App\Http\Controllers;

use App\Enums\QueueItemStatus;
use App\Models\Room;
use App\Services\QueueService;
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
        Gate::authorize('skip', $room);

        $this->queue->advance($room, $this->itemId($request), QueueItemStatus::Skipped);

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

    public function started(Request $request, Room $room): Response
    {
        Gate::authorize('reportPlayback', $room);

        $this->queue->markStarted($room, $this->itemId($request));

        return response()->noContent();
    }

    public function ended(Request $request, Room $room): Response
    {
        Gate::authorize('reportPlayback', $room);

        $reason = $request->validate(['reason' => ['required', 'in:ended,error']])['reason'];

        $this->queue->advance(
            $room,
            $this->itemId($request),
            $reason === 'error' ? QueueItemStatus::Failed : QueueItemStatus::Played,
        );

        return response()->noContent();
    }

    private function itemId(Request $request): int
    {
        return (int) $request->validate(['queue_item_id' => ['required', 'integer']])['queue_item_id'];
    }
}
