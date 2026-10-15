<?php

namespace App\Enums;

enum PlaybackStatus: string
{
    case Playing = 'playing';
    case Paused = 'paused';
}
