<?php

namespace App\Policies;

use App\Enums\ParticipantRole;
use App\Models\Participant;
use App\Models\Room;

/** The authenticated "user" is always a Participant holding a room token. */
class RoomPolicy
{
    public function view(Participant $participant, Room $room): bool
    {
        return $participant->room_id === $room->id
            && $participant->isApproved()
            && $room->isOpen();
    }

    public function leave(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room)
            && $participant->role === ParticipantRole::Guest;
    }

    public function close(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room)
            && $participant->isHost()
            && $participant->tokenCan(ParticipantRole::Host->value);
    }
}
