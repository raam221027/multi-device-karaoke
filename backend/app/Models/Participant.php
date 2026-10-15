<?php

namespace App\Models;

use App\Enums\ParticipantRole;
use App\Enums\ParticipantStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A device in a room (host phone, guest phone or display). Participants are
 * the authenticatable model: each holds a Sanctum token whose ability is its role.
 */
class Participant extends Authenticatable
{
    use HasApiTokens, HasFactory;

    public const TOKEN_TTL_HOURS = 24;

    protected $fillable = [
        'role',
        'display_name',
        'status',
        'can_add_songs',
    ];

    protected $attributes = [
        'status' => 'approved',
        'can_add_songs' => true,
    ];

    protected function casts(): array
    {
        return [
            'role' => ParticipantRole::class,
            'status' => ParticipantStatus::class,
            'can_add_songs' => 'boolean',
            'last_seen_at' => 'datetime',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function isHost(): bool
    {
        return $this->role === ParticipantRole::Host;
    }

    public function isGuest(): bool
    {
        return $this->role === ParticipantRole::Guest;
    }

    public function isDisplay(): bool
    {
        return $this->role === ParticipantRole::Display;
    }

    public function isApproved(): bool
    {
        return $this->status === ParticipantStatus::Approved;
    }

    public function issueToken(): string
    {
        return $this->createToken(
            "room:{$this->room_id}",
            [$this->role->value],
            now()->addHours(self::TOKEN_TTL_HOURS),
        )->plainTextToken;
    }
}
