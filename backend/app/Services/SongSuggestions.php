<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Song and artist suggestions while someone types a search. YouTube search
 * costs quota on every call, so these come from the iTunes catalogue (free,
 * no key); tapping one runs the real YouTube search.
 */
class SongSuggestions
{
    private const LIMIT = 8;

    private const ARTISTS = 3;

    /** @return list<array{type: 'artist'|'song', label: string, artist?: string, query: string}> */
    public function suggest(string $q): array
    {
        $term = trim(preg_replace('/\s+/u', ' ', $q));
        $key = 'song-suggest:'.md5(mb_strtolower($term));

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $results = Http::timeout(3)
                ->acceptJson()
                ->get('https://itunes.apple.com/search', [
                    'term' => $term,
                    'media' => 'music',
                    'entity' => 'song',
                    'limit' => 25,
                ])
                ->throw()
                ->json('results');
        } catch (Throwable) {
            return []; // Not cached, so the next keystroke tries again.
        }

        $suggestions = self::build($term, is_array($results) ? $results : []);
        Cache::put($key, $suggestions, now()->addDay());

        return $suggestions;
    }

    /** Artists whose name matches what was typed first, then songs, without repeats. */
    private static function build(string $term, array $results): array
    {
        $typed = self::normalize($term);
        $artists = $songs = [];

        foreach ($results as $result) {
            $artist = trim((string) ($result['artistName'] ?? ''));
            $track = trim(preg_replace('/\s*[(\[][^)\]]*[)\]]/u', '', (string) ($result['trackName'] ?? '')));
            if ($artist === '' || $track === '') {
                continue;
            }

            $artistKey = self::normalize($artist);
            if (count($artists) < self::ARTISTS && str_contains($artistKey, $typed) && ! isset($artists[$artistKey])) {
                $artists[$artistKey] = ['type' => 'artist', 'label' => $artist, 'query' => $artist];
            }

            $songKey = self::normalize($track).'|'.$artistKey;
            $songs[$songKey] ??= ['type' => 'song', 'label' => $track, 'artist' => $artist, 'query' => "{$track} {$artist}"];
        }

        return array_slice([...array_values($artists), ...array_values($songs)], 0, self::LIMIT);
    }

    /** "Beyoncé" and "beyonce" are the same name. */
    private static function normalize(string $text): string
    {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);

        return preg_replace('/[^a-z0-9]+/', '', mb_strtolower($ascii === false ? $text : $ascii));
    }
}
