<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Services\YouTube;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class SearchController extends Controller
{
    public function __invoke(Request $request, Room $room, YouTube $youtube): JsonResponse
    {
        Gate::authorize('search', $room);

        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:80'],
            'karaoke' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'results' => $youtube->search($data['q'], $request->boolean('karaoke', true)),
        ]);
    }
}
