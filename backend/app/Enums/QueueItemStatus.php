<?php

namespace App\Enums;

enum QueueItemStatus: string
{
    case Queued = 'queued';
    case Playing = 'playing';
    case Played = 'played';
    case Skipped = 'skipped';
    case Removed = 'removed';
    case Failed = 'failed';
}
