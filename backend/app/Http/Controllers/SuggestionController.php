<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Services\SongInfo;
use App\Services\YouTube;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Songs to offer on the search screen before anyone types. */
class SuggestionController extends Controller
{
    private const PER_PAGE = 12;

    public function __invoke(Request $request, Room $room, YouTube $youtube, SongInfo $songInfo): JsonResponse
    {
        Gate::authorize('search', $room);

        $pool = $youtube->popular();

        // "More" walks through the pool a page at a time and wraps back to the start.
        $pages = max(1, (int) ceil(count($pool) / self::PER_PAGE));
        $page = max(0, $request->integer('page')) % $pages;

        return response()->json([
            // Titles come in both orders, so look up which half is the song (cached per title).
            'popular' => array_map(function (array $video) use ($songInfo) {
                $info = $songInfo->identify($video['title']);

                return [...$video, 'song_title' => $info['song'] ?? null, 'artist' => $info['artist'] ?? null];
            }, array_slice($pool, $page * self::PER_PAGE, self::PER_PAGE)),
            'page' => $page,
            'pages' => $pages,
        ]);
    }
}
