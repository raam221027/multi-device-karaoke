<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Services\SongSuggestions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Song and artist suggestions as someone types a search. */
class AutocompleteController extends Controller
{
    public function __invoke(Request $request, Room $room, SongSuggestions $suggestions): JsonResponse
    {
        Gate::authorize('search', $room);

        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:80']]);

        return response()->json(['suggestions' => $suggestions->suggest($data['q'])]);
    }
}
