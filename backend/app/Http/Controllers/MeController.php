<?php

namespace App\Http\Controllers;

use App\Http\Resources\ParticipantResource;
use App\Http\Resources\RoomResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    /** Lets a device resume its session after a reload. */
    public function __invoke(Request $request): JsonResponse
    {
        /** @var \App\Models\Participant $me */
        $me = $request->user();

        return response()->json([
            'room' => new RoomResource($me->room),
            'participant' => new ParticipantResource($me),
        ]);
    }
}
