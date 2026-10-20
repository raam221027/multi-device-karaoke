<?php

namespace App\Models;

use App\Enums\ParticipantRole;
use App\Enums\ParticipantStatus;
use App\Enums\PlaybackStatus;
use App\Enums\QueueItemStatus;
use App\Enums\RoomStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Laravel\Sanctum\PersonalAccessToken;

class Room extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'status',
        'is_locked',
        'requires_approval',
        'allow_song_additions',
        'guests_can_skip',
        'show_side_strip',
        'current_queue_item_id',
        'playback_status',
        'paused_at',
        'paused_seconds',
        'closed_at',
    ];

    protected $attributes = [
        'status' => 'open',
        'is_locked' => false,
        'requires_approval' => false,
        'allow_song_additions' => true,
        'guests_can_skip' => false,
        'show_side_strip' => true,
        'playback_status' => 'playing',
        'paused_seconds' => 0,
        'version' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => RoomStatus::class,
            'is_locked' => 'boolean',
            'requires_approval' => 'boolean',
            'allow_song_additions' => 'boolean',
            'guests_can_skip' => 'boolean',
            'show_side_strip' => 'boolean',
            'playback_status' => PlaybackStatus::class,
            'paused_at' => 'datetime',
            'paused_seconds' => 'integer',
            'version' => 'integer',
            'closed_at' => 'datetime',
        ];
    }

    public function participants(): HasMany
    {
        return $this->hasMany(Participant::class);
    }

    public function host(): HasOne
    {
        return $this->hasOne(Participant::class)->where('role', ParticipantRole::Host);
    }

    public function display(): HasOne
    {
        return $this->hasOne(Participant::class)
            ->where('role', ParticipantRole::Display)
            ->where('status', 'approved')
            ->latestOfMany();
    }

    public function queueItems(): HasMany
    {
        return $this->hasMany(QueueItem::class);
    }

    public function currentItem(): BelongsTo
    {
        return $this->belongsTo(QueueItem::class, 'current_queue_item_id');
    }

    /** Songs waiting to play, in queue order. */
    public function upcoming(): HasMany
    {
        return $this->queueItems()
            ->where('status', QueueItemStatus::Queued)
            ->orderBy('position')
            ->orderBy('id');
    }

    public function isOpen(): bool
    {
        return $this->status === RoomStatus::Open;
    }

    public function isJoinable(): bool
    {
        return $this->isOpen() && ! $this->is_locked;
    }

    /** Every state change bumps the version; call inside the change's transaction. */
    public function bumpVersion(): void
    {
        $this->increment('version');
    }

    /**
     * Make way for a new display. A screen that joined by code has nobody
     * behind it, so it's disconnected. A phone that was the screen goes back
     * to being a guest phone, keeping its token and name. Call inside the
     * change's transaction.
     */
    public function retireDisplays(?Participant $except = null): void
    {
        $displays = $this->participants()
            ->where('role', ParticipantRole::Display)
            ->where('status', ParticipantStatus::Approved)
            ->when($except, fn ($query) => $query->whereKeyNot($except->id))
            ->get();

        foreach ($displays as $display) {
            if ($display->isScreenOnly()) {
                $display->update(['status' => ParticipantStatus::Kicked]);
                $display->tokens()->delete();
            } else {
                $display->assignRole(ParticipantRole::Guest);
            }
        }
    }

    /** Revoke every device session in this room. */
    public function revokeTokens(): void
    {
        PersonalAccessToken::query()
            ->where('tokenable_type', (new Participant)->getMorphClass())
            ->whereIn('tokenable_id', $this->participants()->select('id'))
            ->delete();
    }

    /** How long a finished or abandoned room, and the YouTube details of its songs, are kept. */
    public const KEEP_DAYS = 30;

    /**
     * Delete rooms closed, or left untouched, more than KEEP_DAYS ago, with
     * their guests, songs and sign-in tokens. YouTube's policies allow API data
     * (titles, channels, thumbnails) to be kept at most 30 days.
     */
    public static function pruneOld(): int
    {
        $cutoff = now()->subDays(self::KEEP_DAYS);
        $pruned = 0;

        static::query()
            ->where(fn ($q) => $q->where('closed_at', '<', $cutoff)
                ->orWhere(fn ($q) => $q->whereNull('closed_at')->where('updated_at', '<', $cutoff)))
            ->chunkById(100, function ($rooms) use (&$pruned) {
                foreach ($rooms as $room) {
                    $room->revokeTokens();
                    // Its songs point back at the room, so let go of the current one first.
                    $room->forceFill(['current_queue_item_id' => null])->saveQuietly();
                    $room->delete();
                    $pruned++;
                }
            });

        return $pruned;
    }
}
