<?php

namespace App\Enums;

enum ParticipantStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Kicked = 'kicked';
}
