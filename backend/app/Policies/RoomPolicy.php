<?php

namespace App\Policies;

use App\Enums\ParticipantRole;
use App\Models\Participant;
use App\Models\QueueItem;
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

    /** Guests and the display leave; the host closes the room instead. */
    public function leave(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room)
            && ! $participant->isHost();
    }

    public function close(Participant $participant, Room $room): bool
    {
        return $this->manage($participant, $room);
    }

    /** Settings, guest permissions, removing guests, reordering, pause/resume. */
    public function manage(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room)
            && $participant->isHost()
            && $participant->tokenCan(ParticipantRole::Host->value);
    }

    /** Phones search; the display doesn't. */
    public function search(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room) && ! $participant->isDisplay();
    }

    /** The host always sings; guests sing unless the host turned additions off. */
    public function addSong(Participant $participant, Room $room): bool
    {
        if ($this->manage($participant, $room)) {
            return true;
        }

        return $this->view($participant, $room)
            && $participant->isGuest()
            && $room->allow_song_additions
            && $participant->can_add_songs;
    }

    /** The host always; guests when the host allows it; and anyone can skip their own song. */
    public function skip(Participant $participant, Room $room, ?QueueItem $item = null): bool
    {
        if ($this->manage($participant, $room)) {
            return true;
        }

        return $this->view($participant, $room)
            && ! $participant->isDisplay()
            && ($room->guests_can_skip || $item?->added_by_participant_id === $participant->id);
    }

    /** Only the display reports what the player actually did. */
    public function reportPlayback(Participant $participant, Room $room): bool
    {
        return $this->view($participant, $room)
            && $participant->isDisplay()
            && $participant->tokenCan(ParticipantRole::Display->value);
    }
}
