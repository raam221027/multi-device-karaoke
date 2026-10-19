<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'youtube' => [
        'key' => env('YOUTUBE_API_KEY'),
        // Units per day Google grants this project; search pauses just short of it.
        'daily_quota' => (int) env('YOUTUBE_DAILY_QUOTA', 10000),
        // Searches behind the "Popular karaoke" suggestions, refreshed weekly.
        'popular_searches' => [
            'OPM karaoke hits',
            'greatest karaoke songs of all time',
            'love songs karaoke',
            '90s karaoke hits',
            'pop karaoke hits',
            'rock karaoke songs',
        ],
    ],

    'frontend' => [
        'url' => env('FRONTEND_URL', 'http://localhost:5173'),
    ],

];
