<?php

namespace App\Services;

use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Works out which half of a "X - Y" karaoke title is the song. Uploaders use
 * both orders ("Creed - My Sacrifice", "Alapaap - ERASERHEADS"), so the title
 * alone can't say; the iTunes catalogue (free, no key) can.
 */
class SongInfo
{
    /** @return array{song: string, artist: string}|null null when the order can't be told */
    public function identify(string $title): ?array
    {
        return $this->identifyMany([$title])[$title];
    }

    /**
     * identify() for a page of search results. The catalogue lookups for all
     * the titles go out together instead of one after another, so a page of
     * new titles takes about as long as one.
     *
     * @param  list<string>  $titles
     * @return array<string, array{song: string, artist: string}|null> keyed by title
     */
    public function identifyMany(array $titles): array
    {
        $found = [];
        $pending = [];
        foreach (array_unique($titles) as $title) {
            $halves = self::halves($title);
            $cached = $halves === null ? [] : Cache::get(self::cacheKey(...$halves));
            if ($cached === null) {
                $pending[$title] = $halves;
            } else {
                $found[$title] = $cached ?: null;
            }
        }
        if ($pending === []) {
            return $found;
        }

        // Look for the song first (matching track and artist together).
        $songs = $this->searchAll(array_map(fn ($halves) => implode(' ', $halves), $pending), 'song');
        $order = [];
        $tied = [];
        foreach ($pending as $title => [$first, $second]) {
            if ($songs[$title] === null) {
                $found[$title] = null; // Not cached, so the next song with this title tries again.

                continue;
            }

            [$artistFirst, $songFirst] = self::votes($first, $second, $songs[$title]);
            if ($artistFirst !== $songFirst) {
                $order[$title] = $artistFirst > $songFirst;
            } else {
                $tied[$title] = [$first, $second];
            }
        }

        // A song missing from the catalogue can still be placed by a known artist name.
        $names = array_values(array_unique(array_merge(...array_values($tied))));
        $artists = $names === [] ? [] : $this->searchAll(array_combine($names, $names), 'musicArtist');
        foreach ($tied as $title => [$first, $second]) {
            if ($artists[$first] === null || $artists[$second] === null) {
                $found[$title] = null;

                continue;
            }

            $firstIsArtist = self::isArtist($first, $artists[$first]);
            $secondIsArtist = self::isArtist($second, $artists[$second]);
            $order[$title] = $firstIsArtist === $secondIsArtist ? null : $firstIsArtist;
        }

        foreach ($order as $title => $artistFirst) {
            [$first, $second] = $pending[$title];
            $info = match ($artistFirst) {
                true => ['song' => $second, 'artist' => $first],
                false => ['song' => $first, 'artist' => $second],
                null => [],
            };

            Cache::put(self::cacheKey($first, $second), $info, now()->addDays(30));
            $found[$title] = $info ?: null;
        }

        return $found;
    }

    private static function cacheKey(string $first, string $second): string
    {
        return 'song-info:'.md5(mb_strtolower("{$first}|{$second}"));
    }

    /**
     * How many catalogue songs read "artist - song" and how many "song - artist".
     *
     * @return array{int, int}
     */
    private static function votes(string $first, string $second, array $results): array
    {
        $artistFirst = $songFirst = 0;
        foreach ($results as $result) {
            $track = (string) ($result['trackName'] ?? '');
            $artist = (string) ($result['artistName'] ?? '');

            if (self::matches($first, $artist) && self::matches($second, $track)) {
                $artistFirst++;
            }
            if (self::matches($first, $track) && self::matches($second, $artist)) {
                $songFirst++;
            }
        }

        return [$artistFirst, $songFirst];
    }

    private static function isArtist(string $name, array $results): bool
    {
        return collect($results)
            ->contains(fn ($result) => self::normalize((string) ($result['artistName'] ?? '')) === self::normalize($name));
    }

    /**
     * Catalogue searches, all sent at once.
     *
     * @param  array<string, string>  $terms  search terms by key
     * @return array<string, list<array<string, mixed>>|null> results by the same key, null where the request failed
     */
    private function searchAll(array $terms, string $entity): array
    {
        $responses = Http::pool(function (Pool $pool) use ($terms, $entity) {
            foreach ($terms as $key => $term) {
                $pool->as((string) $key)->timeout(3)->acceptJson()->get('https://itunes.apple.com/search', [
                    'term' => $term,
                    'media' => 'music',
                    'entity' => $entity,
                    'limit' => 15,
                ]);
            }
        });

        return array_map(function ($response) {
            // A timeout or connection error comes back as an exception instead of a response.
            if (! $response instanceof Response || $response->failed()) {
                return null;
            }
            $results = $response->json('results');

            return is_array($results) ? $results : [];
        }, $responses);
    }

    /**
     * The two halves of "X - Y" once karaoke tags are stripped, matching the
     * frontend's parseSongTitle(). Null unless there are exactly two.
     *
     * @return array{string, string}|null
     */
    public static function halves(string $title): ?array
    {
        $rest = preg_replace('/\s*[(\[【][^)\]】]*[)\]】]/u', '', $title);
        $rest = trim(preg_split('/\s+\|\s+/u', trim($rest))[0]);
        $rest = trim(preg_replace('/\s*\b(karaoke( version)?|instrumental|with lyrics|lyrics)\b\s*$/iu', '', $rest));

        $parts = preg_split('/\s+[-–—]\s+/u', $rest);

        return count($parts) === 2 && $parts[0] !== '' && $parts[1] !== '' ? [trim($parts[0]), trim($parts[1])] : null;
    }

    /** "Rockstar 2" matches "Rockstar"; "My Sacrifice" matches "My Sacrifice (Remastered)". */
    private static function matches(string $part, string $catalogue): bool
    {
        $a = self::normalize($part);
        $b = self::normalize($catalogue);

        if ($a === '' || $b === '') {
            return false;
        }

        return $a === $b || (min(strlen($a), strlen($b)) >= 4 && (str_contains($a, $b) || str_contains($b, $a)));
    }

    private static function normalize(string $text): string
    {
        $text = preg_replace('/\s*[(\[][^)\]]*[)\]]/u', '', $text);

        return preg_replace('/[^\p{L}\p{N}]+/u', '', mb_strtolower($text));
    }
}
