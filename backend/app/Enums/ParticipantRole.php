<?php

namespace App\Enums;

enum ParticipantRole: string
{
    case Host = 'host';
    case Guest = 'guest';
    case Display = 'display';
}
