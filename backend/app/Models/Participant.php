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
        'device',
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

    /** A screen that joined by code, with no person behind it. */
    public function isScreenOnly(): bool
    {
        return $this->device !== null;
    }

    public function isDisplay(): bool
    {
        return $this->role === ParticipantRole::Display;
    }

    public function isApproved(): bool
    {
        return $this->status === ParticipantStatus::Approved;
    }

    /** Has a device behind it: someone who left, was removed or let their session expire has no live token. */
    public function isConnected(): bool
    {
        return $this->tokens()
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->exists();
    }

    /** Change role in place: existing tokens keep working but carry the new ability. */
    public function assignRole(ParticipantRole $role): void
    {
        $this->update(['role' => $role]);
        $this->tokens()->update(['abilities' => json_encode([$role->value])]);
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
