<?php

use App\Models\Participant;
use App\Models\Room;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;

// Private channel authorization; /broadcasting/auth is guarded by auth:sanctum (see bootstrap/app.php).

// "Room changed" signals: any device that may read the room's state may listen.
Broadcast::channel('room.{room}', fn (Participant $participant, Room $room) => Gate::forUser($participant)->allows('view', $room));
