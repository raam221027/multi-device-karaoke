<?php

namespace App\Http\Controllers;

use App\Http\Resources\QueueItemResource;
use App\Models\QueueItem;
use App\Models\Room;
use App\Services\QueueService;
use App\Services\SongInfo;
use App\Services\YouTube;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class QueueController extends Controller
{
    public function __construct(private QueueService $queue) {}

    /**
     * Add a song under the caller's name. The host sings like anyone else.
     * Metadata comes from YouTube, never from the client.
     */
    public function store(Request $request, Room $room, YouTube $youtube, SongInfo $songInfo): JsonResponse
    {
        Gate::authorize('addSong', $room);

        $data = $request->validate([
            'youtube_video_id' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{11}$/'],
        ]);

        $video = $youtube->video($data['youtube_video_id']);
        abort_if($video === null, 422, 'That video can\'t be played here. Pick another version.');

        // Looked up before taking the room lock, so a slow catalogue never holds up the queue.
        $info = $songInfo->identify($video['title']);
        $video['song_title'] = $info['song'] ?? null;
        $video['artist'] = $info['artist'] ?? null;

        $item = $this->queue->add($room, $request->user(), $video);

        return (new QueueItemResource($item->load('addedBy')))->response()->setStatusCode(201);
    }

    public function destroy(Room $room, QueueItem $item): Response
    {
        abort_unless($item->room_id === $room->id, 404);
        Gate::authorize('delete', $item);

        $this->queue->remove($room, $item);

        return response()->noContent();
    }

    public function reorder(Request $request, Room $room): Response
    {
        Gate::authorize('manage', $room);

        $data = $request->validate([
            'item_ids' => ['present', 'array'],
            'item_ids.*' => ['integer', 'distinct'],
        ]);

        $this->queue->reorder($room, array_map('intval', $data['item_ids']));

        return response()->noContent();
    }
}
