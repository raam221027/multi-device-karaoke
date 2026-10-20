<?php

namespace App\Http\Resources;

use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Room */
class RoomResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // A closed room's code is never shown again.
            'code' => $this->isOpen() ? $this->code : null,
            'name' => $this->name,
            'status' => $this->status,
            'is_locked' => $this->is_locked,
            'requires_approval' => $this->requires_approval,
            'allow_song_additions' => $this->allow_song_additions,
            'guests_can_skip' => $this->guests_can_skip,
            'show_side_strip' => $this->show_side_strip,
            'playback_status' => $this->playback_status,
            'paused_at' => $this->paused_at,
            'paused_seconds' => $this->paused_seconds,
            'version' => $this->version,
            'closed_at' => $this->closed_at,
        ];
    }
}
