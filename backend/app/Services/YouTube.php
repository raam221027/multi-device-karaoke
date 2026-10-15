<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Server-side proxy for the YouTube Data API. search.list costs 100 quota
 * units, so results are cached by normalized query.
 */
class YouTube
{
    private const BASE = 'https://www.googleapis.com/youtube/v3';

    private const CACHE_HOURS = 24;

    /**
     * @return list<array{id: string, title: string, channel_title: string|null, thumbnail_url: string|null, duration_seconds: int|null}>
     */
    public function search(string $query, bool $karaoke = true): array
    {
        $normalized = Str::of($query)->lower()->squish()->value();
        $q = $karaoke && ! str_contains($normalized, 'karaoke') ? "{$normalized} karaoke" : $normalized;

        return Cache::remember('youtube:search:'.sha1($q), now()->addHours(self::CACHE_HOURS), function () use ($q) {
            $ids = $this->get('/search', [
                'part' => 'snippet',
                'type' => 'video',
                'videoEmbeddable' => 'true',
                'maxResults' => 12,
                'q' => $q,
            ])->pluck('id.videoId')->filter()->values()->all();

            return $this->videos($ids);
        });
    }

    /**
     * Well-known karaoke songs for the search screen's suggestions: the
     * configured searches interleaved, minus long videos. The whole pool is
     * returned for the screen to page through. Shared by every room and
     * cached for a week, so it costs a few searches a week.
     * Medleys, "Top 10" lists and Shorts are dropped: suggestions are single songs.
     * Empty when YouTube is unavailable; suggestions are optional.
     */
    public function popular(): array
    {
        $cached = Cache::get('youtube:popular:v2');
        if ($cached !== null) {
            return $cached;
        }

        try {
            $lists = array_map(fn ($q) => $this->search($q), config('services.youtube.popular_searches', []));
        } catch (HttpException) {
            return []; // Not cached, so the next visit tries again.
        }

        // Interleave (1st of each search, then 2nd of each…) so no one search dominates.
        $songs = collect($lists)
            ->flatMap(fn ($list) => array_map(fn ($video, $rank) => [$rank, $video], $list, array_keys($list)))
            ->sortBy(0)
            ->pluck(1)
            ->filter(fn ($video) => ($video['duration_seconds'] ?? 0) >= 90 && $video['duration_seconds'] <= 600)
            ->reject(fn ($video) => preg_match('/medley|nonstop|non-stop|compilation|#shorts|\btop\s*\d+|\bbest songs\b/iu', $video['title']))
            ->unique('id')
            ->take(60)
            ->values()
            ->all();

        Cache::put('youtube:popular:v2', $songs, now()->addDays(7));

        return $songs;
    }

    /** Metadata for one embeddable video, or null if it doesn't exist. */
    public function video(string $id): ?array
    {
        return Cache::remember('youtube:video:'.$id, now()->addHours(self::CACHE_HOURS), fn () => $this->videos([$id])[0] ?? null);
    }

    /** @param  list<string>  $ids */
    private function videos(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return $this->get('/videos', [
            'part' => 'snippet,contentDetails,status',
            'id' => implode(',', $ids),
        ])
            ->filter(fn ($v) => $v['status']['embeddable'] ?? true)
            ->map(fn ($v) => [
                'id' => $v['id'],
                'title' => html_entity_decode($v['snippet']['title'] ?? '', ENT_QUOTES),
                'channel_title' => $v['snippet']['channelTitle'] ?? null,
                'thumbnail_url' => $v['snippet']['thumbnails']['medium']['url']
                    ?? $v['snippet']['thumbnails']['default']['url'] ?? null,
                'duration_seconds' => self::parseDuration($v['contentDetails']['duration'] ?? null),
            ])->values()->all();
    }

    private function get(string $path, array $query): Collection
    {
        try {
            return $this->client()->get($path, $query)->throw()->collect('items');
        } catch (ConnectionException|RequestException $e) {
            report($e);
            abort(502, 'YouTube search is unavailable right now. Try again in a moment.');
        }
    }

    private function client(): PendingRequest
    {
        $key = config('services.youtube.key');

        abort_if(blank($key), 503, 'Song search isn\'t set up yet. Add YOUTUBE_API_KEY to the server\'s .env.');

        return Http::baseUrl(self::BASE)->withQueryParameters(['key' => $key])->timeout(8);
    }

    /** ISO 8601 duration (PT3M52S) to seconds. */
    public static function parseDuration(?string $iso): ?int
    {
        if (! $iso || ! preg_match('/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/', $iso, $m)) {
            return null;
        }

        return ((int) ($m[1] ?? 0)) * 86400 + ((int) ($m[2] ?? 0)) * 3600 + ((int) ($m[3] ?? 0)) * 60 + (int) ($m[4] ?? 0);
    }
}
