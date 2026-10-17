<?php

namespace App\Http\Controllers;

use App\Enums\ParticipantRole;
use App\Enums\ParticipantStatus;
use App\Enums\RoomStatus;
use App\Http\Requests\CreateRoomRequest;
use App\Http\Requests\DisplayJoinRequest;
use App\Http\Requests\JoinRoomRequest;
use App\Http\Requests\UpdateRoomRequest;
use App\Http\Resources\ParticipantResource;
use App\Http\Resources\QueueItemResource;
use App\Http\Resources\RoomResource;
use App\Models\Participant;
use App\Models\Room;
use App\Support\RoomCode;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RoomController extends Controller
{
    public function store(CreateRoomRequest $request): JsonResponse
    {
        // Two hosts could draw the same unused code at once; the unique index
        // catches that and we simply draw again.
        [$room, $host] = retry(3, fn () => DB::transaction(function () use ($request) {
            $name = $request->string('display_name')->trim()->value();
            $room = Room::create([
                'code' => RoomCode::generate(),
                'name' => 'Videokehan',
            ]);

            $host = $room->participants()->create([
                'role' => ParticipantRole::Host,
                'display_name' => $name,
                'status' => ParticipantStatus::Approved,
            ]);

            return [$room, $host];
        }), 0, fn ($e) => $e instanceof UniqueConstraintViolationException);

        return $this->session($room->refresh(), $host, 201);
    }

    /** Preview a code before asking for a name (the QR link lands here). */
    public function lookup(string $code): JsonResponse
    {
        $room = $this->findOpenRoom($code);

        return response()->json([
            'id' => $room->id,
            'code' => $room->code,
            'joinable' => $room->isJoinable(),
            'is_locked' => $room->is_locked,
            'requires_approval' => $room->requires_approval,
        ]);
    }

    public function join(JoinRoomRequest $request): JsonResponse
    {
        $room = $this->findOpenRoom($request->input('code'));

        abort_if($room->is_locked, 423, 'This room is locked. Ask the host to unlock it.');

        $guest = DB::transaction(function () use ($room, $request) {
            $guest = $room->participants()->create([
                'role' => ParticipantRole::Guest,
                'display_name' => $request->string('display_name')->trim()->value(),
                // Approval flow arrives in Phase 6; the column is already honoured.
                'status' => $room->requires_approval ? ParticipantStatus::Pending : ParticipantStatus::Approved,
            ]);

            $room->bumpVersion();

            return $guest;
        });

        return $this->session($room->refresh(), $guest, 201);
    }

    /**
     * A TV or laptop browser connects by room code and becomes the room's
     * display. Only one display at a time: a new one replaces the old, which
     * is how the host switches screens.
     */
    public function joinAsDisplay(DisplayJoinRequest $request): JsonResponse
    {
        $room = $this->findOpenRoom($request->input('code'));

        abort_if($room->is_locked, 423, 'This room is locked. Ask the host to allow guests to join.');

        $display = DB::transaction(function () use ($room, $request) {
            $display = $this->replaceDisplay($room, $request->input('device'));
            $room->bumpVersion();

            return $display;
        });

        return $this->session($room->refresh(), $display, 201);
    }

    /**
     * The host turns their own device into the screen. The room must never be
     * without a host, so they name who takes over: a guest phone, or the
     * current screen (a swap). Roles change in place and every device keeps
     * its token, so nobody is disconnected; each device sees its new role on
     * its next poll and moves to the matching page. Any other screen is
     * retired (see Room::retireDisplays).
     */
    public function becomeDisplay(Request $request, Room $room): Response
    {
        Gate::authorize('manage', $room);

        $data = $request->validate(['participant_id' => ['required', 'integer']]);

        $next = $room->participants()
            ->whereKey($data['participant_id'])
            ->where('status', ParticipantStatus::Approved)
            ->firstOr(fn () => abort(404));
        abort_if($next->isHost(), 422, 'Pick a guest or the screen to take over as host.');

        /** @var Participant $host */
        $host = $request->user();

        DB::transaction(function () use ($room, $host, $next) {
            Room::whereKey($room->id)->lockForUpdate()->firstOrFail();

            $room->retireDisplays(except: $next);

            // A screen that joined by code becomes a person, named after its device ("PC").
            if ($next->isScreenOnly()) {
                $next->update(['can_add_songs' => true, 'device' => null]);
            }
            $next->assignRole(ParticipantRole::Host);

            // Keeps its name, so its queued songs still say who's singing.
            $host->assignRole(ParticipantRole::Display);

            $room->bumpVersion();
        });

        return response()->noContent();
    }

    /**
     * A guest's phone connects as the screen. It becomes the display in place
     * (same token) rather than joining a second time, so one device is never
     * two participants that a later handoff could tell apart.
     */
    public function useAsDisplay(Request $request, Room $room): Response
    {
        Gate::authorize('leave', $room);

        /** @var Participant $me */
        $me = $request->user();
        abort_unless($me->isGuest(), 422, 'Only a guest\'s phone can become the display.');

        DB::transaction(function () use ($room, $me) {
            Room::whereKey($room->id)->lockForUpdate()->firstOrFail();

            $room->retireDisplays(except: $me);
            $me->assignRole(ParticipantRole::Display);

            $room->bumpVersion();
        });

        return response()->noContent();
    }

    /** Only one display at a time: retire the current one and create its replacement. */
    private function replaceDisplay(Room $room, ?string $device): Participant
    {
        $room->retireDisplays();
        $device ??= 'Screen';

        return $room->participants()->create([
            'role' => ParticipantRole::Display,
            'display_name' => $device,
            'device' => $device,
            'status' => ParticipantStatus::Approved,
            'can_add_songs' => false,
        ]);
    }

    public function update(UpdateRoomRequest $request, Room $room): RoomResource
    {
        Gate::authorize('manage', $room);

        DB::transaction(function () use ($request, $room) {
            $locked = Room::whereKey($room->id)->lockForUpdate()->firstOrFail();
            $locked->update($request->validated());
            $locked->bumpVersion();
        });

        return new RoomResource($room->refresh());
    }

    public function state(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('view', $room);

        /** @var Participant $me */
        $me = $request->user();

        if ($me->last_seen_at === null || $me->last_seen_at->lt(now()->subMinute())) {
            $me->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        $participants = $room->participants()
            ->where('status', ParticipantStatus::Approved)
            ->orderBy('id')
            ->get();

        $room->load(['currentItem.addedBy', 'upcoming.addedBy']);

        return response()->json([
            'room' => new RoomResource($room),
            'participants' => ParticipantResource::collection($participants),
            'me' => new ParticipantResource($me),
            'queue' => [
                'current' => $room->currentItem ? new QueueItemResource($room->currentItem) : null,
                'upcoming' => QueueItemResource::collection($room->upcoming),
            ],
            'display_connected' => $participants->contains(fn (Participant $p) => $p->isDisplay()),
            // Lets clients compute elapsed song time without trusting their own clock.
            'server_time' => now(),
        ]);
    }

    public function leave(Request $request, Room $room): Response
    {
        Gate::authorize('leave', $room);

        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function close(Room $room): Response
    {
        Gate::authorize('close', $room);

        DB::transaction(function () use ($room) {
            $locked = Room::whereKey($room->id)->lockForUpdate()->firstOrFail();

            if (! $locked->isOpen()) {
                return;
            }

            $locked->update(['status' => RoomStatus::Closed, 'closed_at' => now()]);
            $locked->bumpVersion();
            $locked->revokeTokens();
        });

        return response()->noContent();
    }

    private function findOpenRoom(string $code): Room
    {
        $code = RoomCode::normalize($code);

        abort_unless(RoomCode::isValid($code), 404, 'Room not found.');

        return Room::where('code', $code)
            ->where('status', RoomStatus::Open)
            ->firstOr(fn () => abort(404, 'Room not found.'));
    }

    private function session(Room $room, Participant $participant, int $status): JsonResponse
    {
        return response()->json([
            'room' => new RoomResource($room),
            'participant' => new ParticipantResource($participant),
            'token' => $participant->issueToken(),
        ], $status);
    }
}
