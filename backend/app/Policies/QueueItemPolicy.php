<?php

namespace App\Policies;

use App\Models\Participant;
use App\Models\QueueItem;
use Illuminate\Support\Facades\Gate;

class QueueItemPolicy
{
    /** The host removes any waiting song; a guest only their own. */
    public function delete(Participant $participant, QueueItem $item): bool
    {
        if (Gate::forUser($participant)->allows('manage', $item->room)) {
            return true;
        }

        return Gate::forUser($participant)->allows('view', $item->room)
            && $item->added_by_participant_id === $participant->id;
    }
}
