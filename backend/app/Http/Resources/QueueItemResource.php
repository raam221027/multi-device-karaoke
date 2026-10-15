<?php

namespace App\Http\Resources;

use App\Models\QueueItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin QueueItem */
class QueueItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'youtube_video_id' => $this->youtube_video_id,
            'title' => $this->title,
            'song_title' => $this->song_title,
            'artist' => $this->artist,
            'channel_title' => $this->channel_title,
            'thumbnail_url' => $this->thumbnail_url,
            'duration_seconds' => $this->duration_seconds,
            'position' => $this->position,
            'status' => $this->status,
            'started_at' => $this->started_at,
            'added_by' => [
                'id' => $this->added_by_participant_id,
                'display_name' => $this->addedBy?->display_name,
            ],
        ];
    }
}
