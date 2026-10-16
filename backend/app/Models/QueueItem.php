<?php

namespace App\Models;

use App\Enums\QueueItemStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A song in a room's shared queue, credited to the participant who added it. */
class QueueItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'added_by_participant_id',
        'youtube_video_id',
        'title',
        'song_title',
        'artist',
        'channel_title',
        'thumbnail_url',
        'duration_seconds',
        'video_swaps',
        'position',
        'status',
        'started_at',
        'ended_at',
    ];

    protected $attributes = [
        'status' => 'queued',
    ];

    protected function casts(): array
    {
        return [
            'status' => QueueItemStatus::class,
            'duration_seconds' => 'integer',
            'video_swaps' => 'integer',
            'position' => 'integer',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(Participant::class, 'added_by_participant_id');
    }

    public function isQueued(): bool
    {
        return $this->status === QueueItemStatus::Queued;
    }
}
