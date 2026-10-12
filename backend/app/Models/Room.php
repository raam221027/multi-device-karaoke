<?php

namespace App\Models;

use App\Enums\ParticipantRole;
use App\Enums\RoomStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Laravel\Sanctum\PersonalAccessToken;

class Room extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'status',
        'is_locked',
        'requires_approval',
        'closed_at',
    ];

    protected $attributes = [
        'status' => 'open',
        'is_locked' => false,
        'requires_approval' => false,
        'version' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => RoomStatus::class,
            'is_locked' => 'boolean',
            'requires_approval' => 'boolean',
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

    /** Revoke every device session in this room. */
    public function revokeTokens(): void
    {
        PersonalAccessToken::query()
            ->where('tokenable_type', (new Participant)->getMorphClass())
            ->whereIn('tokenable_id', $this->participants()->select('id'))
            ->delete();
    }
}
