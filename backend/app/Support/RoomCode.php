<?php

namespace App\Support;

use App\Models\Room;

/**
 * Room codes are the only join credential (no PIN), so they are drawn with a
 * CSPRNG from an alphabet without look-alike characters (0/O, 1/I/L).
 */
class RoomCode
{
    public const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public const LENGTH = 6;

    /** A random code not used by any existing room. */
    public static function generate(): string
    {
        do {
            $code = self::random();
        } while (Room::where('code', $code)->exists());

        return $code;
    }

    public static function random(): string
    {
        $max = strlen(self::ALPHABET) - 1;
        $code = '';

        for ($i = 0; $i < self::LENGTH; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }

    /** Uppercase and drop spaces/dashes so "abc-d2f" matches "ABCD2F". */
    public static function normalize(?string $code): string
    {
        return strtoupper(preg_replace('/[\s-]+/', '', (string) $code));
    }

    public static function isValid(string $code): bool
    {
        return preg_match('/^['.self::ALPHABET.']{'.self::LENGTH.'}$/', $code) === 1;
    }
}
