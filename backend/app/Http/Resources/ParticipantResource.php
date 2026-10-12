<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Participant */
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
            'joined_at' => $this->created_at,
        ];
    }
}
