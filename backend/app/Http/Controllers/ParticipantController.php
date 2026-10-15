<?php

namespace App\Http\Controllers;

use App\Enums\ParticipantStatus;
use App\Http\Resources\ParticipantResource;
use App\Models\Participant;
use App\Models\Room;
use App\Services\QueueService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/** The host's guest controls: song permission and removal. */
class ParticipantController extends Controller
{
    public function update(Request $request, Room $room, Participant $participant): ParticipantResource
    {
        Gate::authorize('manage', $room);
        $this->ensureGuestOf($room, $participant);

        $data = $request->validate(['can_add_songs' => ['required', 'boolean']]);

        DB::transaction(function () use ($room, $participant, $data) {
            Room::whereKey($room->id)->lockForUpdate()->firstOrFail();
            $participant->update($data);
            $room->bumpVersion();
        });

        return new ParticipantResource($participant->refresh());
    }

    /** Ends the device's session and drops their waiting songs. A song already playing finishes. */
    public function destroy(Room $room, Participant $participant, QueueService $queue): Response
    {
        Gate::authorize('manage', $room);
        $this->ensureGuestOf($room, $participant);

        DB::transaction(function () use ($room, $participant, $queue) {
            $participant->update(['status' => ParticipantStatus::Kicked]);
            $participant->tokens()->delete();
            $queue->removeAllBy($room, $participant);
        });

        return response()->noContent();
    }

    /** The host can manage guests and the display, never themselves. */
    private function ensureGuestOf(Room $room, Participant $participant): void
    {
        abort_unless($participant->room_id === $room->id && $participant->isApproved(), 404);
        abort_if($participant->isHost(), 422, 'The host can\'t be removed. Close the room instead.');
    }
}
