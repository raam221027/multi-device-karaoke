<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Room */
class RoomResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // A closed room's code is never shown again.
            'code' => $this->isOpen() ? $this->code : null,
            'status' => $this->status,
            'is_locked' => $this->is_locked,
            'requires_approval' => $this->requires_approval,
            'version' => $this->version,
            'closed_at' => $this->closed_at,
        ];
    }
}
