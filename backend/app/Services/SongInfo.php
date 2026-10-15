<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

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
        $halves = self::halves($title);
        if ($halves === null) {
            return null;
        }

        [$first, $second] = $halves;
        $key = 'song-info:'.md5(mb_strtolower("{$first}|{$second}"));

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached ?: null;
        }

        try {
            $artistFirst = $this->artistComesFirst($first, $second);
        } catch (Throwable) {
            return null; // Not cached, so the next song with this title tries again.
        }

        $info = match ($artistFirst) {
            true => ['song' => $second, 'artist' => $first],
            false => ['song' => $first, 'artist' => $second],
            null => [],
        };

        Cache::put($key, $info, now()->addDays(30));

        return $info ?: null;
    }

    /**
     * Look for the song first (matching track and artist together); a song
     * missing from the catalogue can still be placed by a known artist name.
     */
    private function artistComesFirst(string $first, string $second): ?bool
    {
        $artistFirst = $songFirst = 0;
        foreach ($this->search("{$first} {$second}", 'song') as $result) {
            $track = (string) ($result['trackName'] ?? '');
            $artist = (string) ($result['artistName'] ?? '');

            if (self::matches($first, $artist) && self::matches($second, $track)) {
                $artistFirst++;
            }
            if (self::matches($first, $track) && self::matches($second, $artist)) {
                $songFirst++;
            }
        }

        if ($artistFirst !== $songFirst) {
            return $artistFirst > $songFirst;
        }

        $isArtist = fn (string $name) => collect($this->search($name, 'musicArtist'))
            ->contains(fn ($result) => self::normalize((string) ($result['artistName'] ?? '')) === self::normalize($name));

        $firstIsArtist = $isArtist($first);
        $secondIsArtist = $isArtist($second);

        return $firstIsArtist === $secondIsArtist ? null : $firstIsArtist;
    }

    /** @return list<array<string, mixed>> */
    private function search(string $term, string $entity): array
    {
        $results = Http::timeout(3)
            ->acceptJson()
            ->get('https://itunes.apple.com/search', [
                'term' => $term,
                'media' => 'music',
                'entity' => $entity,
                'limit' => 15,
            ])
            ->throw()
            ->json('results');

        return is_array($results) ? $results : [];
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
