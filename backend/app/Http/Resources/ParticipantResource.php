<?php

namespace App\Http\Resources;

use App\Models\Participant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Participant */
class ParticipantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'room_id' => $this->room_id,
            'display_name' => $this->display_name,
            'role' => $this->role,
            'status' => $this->status,
            'can_add_songs' => $this->can_add_songs,
            'joined_at' => $this->created_at,
        ];
    }
}
