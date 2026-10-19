<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Server-side proxy for the YouTube Data API. search.list costs 100 quota
 * units, so results are cached by normalized query, and the day's spending
 * is counted so search pauses before the quota runs out instead of failing
 * for everyone.
 */
class YouTube
{
    private const BASE = 'https://www.googleapis.com/youtube/v3';

    /** API data may be kept up to 30 days; a week keeps it fresh and well under that. */
    private const CACHE_DAYS = 7;

    /** Quota units per call (https://developers.google.com/youtube/v3/determine_quota_cost). */
    private const COST = ['/search' => 100, '/videos' => 1];

    /** New searches stop at this share of the daily quota, leaving room for adding songs. */
    private const SEARCH_BUDGET = 0.95;

    public const RESTING_MESSAGE = 'Song search is resting until tomorrow. Clear the search box to pick from Popular karaoke.';

    /** Karaoke channels without "karaoke" in their name (lowercase). */
    private const KARAOKE_CHANNELS = ['sing king', 'karafun', 'singsongs', 'zoom karaoke official', 'sing2piano'];

    /**
     * @return list<array{id: string, title: string, channel_title: string|null, thumbnail_url: string|null, duration_seconds: int|null}>
     */
    public function search(string $query, bool $karaoke = true): array
    {
        return $this->searchPage($query, $karaoke)['videos'];
    }

    /**
     * One page of search results, plus the token for the next page (null on
     * the last). Each page is its own search.list call, cached separately.
     *
     * @return array{videos: list<array{id: string, title: string, channel_title: string|null, thumbnail_url: string|null, duration_seconds: int|null}>, next: string|null}
     */
    public function searchPage(string $query, bool $karaoke = true, ?string $pageToken = null): array
    {
        $q = self::normalizeQuery($query, $karaoke);
        $key = 'youtube:search:v4:'.sha1($q.'|'.($pageToken ?? ''));

        $page = Cache::get($key);
        if ($page !== null) {
            $this->count('hits');
        } else {
            abort_unless($this->canSearch(), 503, self::RESTING_MESSAGE);
            $this->count('searches');

            $json = $this->request('/search', array_filter([
                'part' => 'snippet',
                'type' => 'video',
                'videoEmbeddable' => 'true',
                // Same 100 units for 20 results as for 12, so fewer "More" taps.
                'maxResults' => 20,
                'q' => $q,
                'pageToken' => $pageToken,
            ]));
            $ids = collect($json['items'] ?? [])->pluck('id.videoId')->filter()->values()->all();

            $page = ['videos' => $this->videos($ids), 'next' => $json['nextPageToken'] ?? null];
            Cache::put($key, $page, now()->addDays(self::CACHE_DAYS));
        }

        return ['videos' => $this->playable($page['videos']), 'next' => $page['next']];
    }

    /**
     * One cache entry per song however it's typed: "Alapaap!", " alapaap"
     * and "Karaoke Alapaap" all search for "alapaap karaoke".
     */
    public static function normalizeQuery(string $query, bool $karaoke = true): string
    {
        $words = Str::of($query)->lower()->replaceMatches('/[^\p{L}\p{N}\']+/u', ' ')->squish();

        if (! $karaoke) {
            return $words->value();
        }

        return $words->replaceMatches('/\bkaraoke\b/u', '')->squish()->append(' karaoke')->trim()->value();
    }

    /** Whether a new (uncached) search fits in today's quota. */
    public function canSearch(): bool
    {
        if (Cache::has($this->dayKey('resting'))) {
            return false;
        }

        $budget = (int) config('services.youtube.daily_quota', 10000) * self::SEARCH_BUDGET;

        return $this->usage()['units'] + self::COST['/search'] + self::COST['/videos'] <= $budget;
    }

    /**
     * Today's spending, in YouTube's quota day (midnight Pacific).
     *
     * @return array{day: string, units: int, searches: int, hits: int, resting: bool}
     */
    public function usage(): array
    {
        return [
            'day' => $this->quotaDay(),
            'units' => (int) Cache::get($this->dayKey('units'), 0),
            'searches' => (int) Cache::get($this->dayKey('searches'), 0),
            'hits' => (int) Cache::get($this->dayKey('hits'), 0),
            'resting' => Cache::has($this->dayKey('resting')),
        ];
    }

    private function count(string $what, int $by = 1): void
    {
        $key = $this->dayKey($what);
        Cache::add($key, 0, now()->addDays(2));
        Cache::increment($key, $by);
    }

    private function quotaDay(): string
    {
        return now('America/Los_Angeles')->toDateString();
    }

    private function dayKey(string $what): string
    {
        return "youtube:{$what}:".$this->quotaDay();
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
        $cached = Cache::get('youtube:popular:v3');
        if ($cached !== null) {
            return $this->playable($cached);
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

        Cache::put('youtube:popular:v3', $songs, now()->addDays(7));

        return $this->playable($songs);
    }

    /** Metadata for one embeddable video, or null if it doesn't exist or won't play here. */
    public function video(string $id): ?array
    {
        if ($this->isBlocked($id)) {
            return null;
        }

        return Cache::remember('youtube:video:'.$id, now()->addDays(self::CACHE_DAYS), fn () => $this->videos([$id])[0] ?? null);
    }

    /**
     * Remember a video whose owner blocks playback on other sites. The API
     * still calls these embeddable; only the player finds out, so the display
     * reports them and they're hidden from then on.
     */
    public function block(string $id): void
    {
        Cache::put('youtube:blocked:'.$id, true, now()->addDays(30));
    }

    public function isBlocked(string $id): bool
    {
        return Cache::has('youtube:blocked:'.$id);
    }

    /** Remember a video that really started on a TV, so it ranks first from then on. */
    public function markPlayable(string $id): void
    {
        Cache::put('youtube:playable:'.$id, true, now()->addDays(30));
    }

    public function isPlayable(string $id): bool
    {
        return Cache::has('youtube:playable:'.$id);
    }

    /**
     * Drop blocked videos and put the ones likely to play on the TV first.
     * Runs on every read, so lists cached earlier pick up what the TVs have
     * learned since. Ties keep YouTube's relevance order.
     */
    private function playable(array $videos): array
    {
        $videos = array_values(array_filter($videos, fn ($video) => ! $this->isBlocked($video['id'])));
        $scores = array_map(fn ($video) => $this->score($video), $videos);
        array_multisort($scores, SORT_DESC, array_keys($videos), SORT_ASC, $videos);

        return array_map(fn ($video) => Arr::except($video, ['licensed', 'restricted']), $videos);
    }

    /**
     * How likely a video is to play embedded. The API calls them all
     * embeddable, but label uploads (VEVO, "- Topic", official channels)
     * often refuse other sites, while karaoke channels rarely do.
     */
    private function score(array $video): int
    {
        $channel = mb_strtolower((string) ($video['channel_title'] ?? ''));
        $score = 0;

        if ($this->isPlayable($video['id'])) {
            $score += 100;
        }
        if (str_contains($channel, 'karaoke') || in_array($channel, self::KARAOKE_CHANNELS, true)) {
            $score += 20;
        }
        if (preg_match('/\b(karaoke|instrumental)\b/iu', $video['title'])) {
            $score += 10;
        }
        if (($video['licensed'] ?? false) && preg_match('/vevo$| - topic$|official/u', $channel)) {
            $score -= 50;
        }
        if ($video['restricted'] ?? false) {
            $score -= 30;
        }

        return $score;
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
            // Age-restricted videos never play embedded.
            ->reject(fn ($v) => ($v['contentDetails']['contentRating']['ytRating'] ?? null) === 'ytAgeRestricted')
            ->map(fn ($v) => [
                'id' => $v['id'],
                'title' => html_entity_decode($v['snippet']['title'] ?? '', ENT_QUOTES),
                'channel_title' => $v['snippet']['channelTitle'] ?? null,
                'thumbnail_url' => $v['snippet']['thumbnails']['medium']['url']
                    ?? $v['snippet']['thumbnails']['default']['url'] ?? null,
                'duration_seconds' => self::parseDuration($v['contentDetails']['duration'] ?? null),
                // Ranking hints, stripped before results leave the server.
                'licensed' => (bool) ($v['contentDetails']['licensedContent'] ?? false),
                'restricted' => isset($v['contentDetails']['regionRestriction']),
            ])->values()->all();
    }

    private function get(string $path, array $query): Collection
    {
        return collect($this->request($path, $query)['items'] ?? []);
    }

    private function request(string $path, array $query): array
    {
        $client = $this->client();
        // YouTube charges the call whether or not it succeeds.
        $this->count('units', self::COST[$path] ?? 1);

        try {
            return $client->get($path, $query)->throw()->json() ?? [];
        } catch (RequestException $e) {
            $reason = $e->response->json('error.errors.0.reason');
            if (in_array($reason, ['quotaExceeded', 'dailyLimitExceeded'], true)) {
                // Rest until YouTube's quota day turns over instead of failing every search.
                Cache::put($this->dayKey('resting'), true, now('America/Los_Angeles')->endOfDay());
                abort(503, self::RESTING_MESSAGE);
            }
            report($e);
            abort(502, 'YouTube search is unavailable right now. Try again in a moment.');
        } catch (ConnectionException $e) {
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
