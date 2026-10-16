<?php

namespace App\Services;

use App\Models\QueueItem;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Another upload of a queued song, for when the chosen video refuses to play
 * on the TV. Searches cost quota, so this runs only after a real failure.
 */
class AlternativeVideo
{
    public function __construct(private YouTube $youtube) {}

    public function find(QueueItem $item): ?array
    {
        try {
            $results = $this->youtube->search(self::query($item));
        } catch (HttpException) {
            return null;
        }

        foreach ($results as $video) {
            $seconds = $video['duration_seconds'] ?? 0;
            if ($video['id'] !== $item->youtube_video_id && $seconds >= 90 && $seconds <= 600) {
                return $video;
            }
        }

        return null;
    }

    /** "Alapaap Eraserheads" when the song is known, otherwise the title without its decorations. */
    private static function query(QueueItem $item): string
    {
        if ($item->song_title && $item->artist) {
            return "{$item->song_title} {$item->artist}";
        }

        $title = preg_replace('/\s*[(\[【][^)\]】]*[)\]】]/u', '', $item->title);
        $title = trim(preg_split('/\s+\|\s+/u', trim($title))[0]);

        return trim(preg_replace('/\b(karaoke( version)?|instrumental|with lyrics|lyrics|official (music )?video|mv)\b/iu', '', $title)) ?: $item->title;
    }
}
