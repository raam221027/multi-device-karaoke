<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Services\SongInfo;
use App\Services\YouTube;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class SearchController extends Controller
{
    public function __invoke(Request $request, Room $room, YouTube $youtube, SongInfo $songInfo): JsonResponse
    {
        Gate::authorize('search', $room);

        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:80'],
            'karaoke' => ['sometimes', 'boolean'],
            // YouTube's nextPageToken from the previous page, passed back as-is.
            'page' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]+$/'],
        ]);

        $page = $youtube->searchPage($data['q'], $request->boolean('karaoke', true), $data['page'] ?? null);

        // Titles come in both orders, so look up which half is the song (cached per title).
        $songs = $songInfo->identifyMany(array_column($page['videos'], 'title'));

        return response()->json([
            'results' => array_map(function (array $video) use ($songs) {
                $info = $songs[$video['title']] ?? null;

                return [...$video, 'song_title' => $info['song'] ?? null, 'artist' => $info['artist'] ?? null];
            }, $page['videos']),
            'next_page' => $page['next'],
        ]);
    }
}
