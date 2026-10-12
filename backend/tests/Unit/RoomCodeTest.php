<?php

use App\Support\RoomCode;

it('draws codes from the unambiguous alphabet', function () {
    foreach (range(1, 200) as $_) {
        $code = RoomCode::random();

        expect($code)->toHaveLength(6)
            ->and(RoomCode::isValid($code))->toBeTrue()
            ->and($code)->not->toMatch('/[01ILO]/');
    }
});

it('normalizes typed codes', function () {
    expect(RoomCode::normalize(' abc-d2f '))->toBe('ABCD2F')
        ->and(RoomCode::normalize('ab cd 23'))->toBe('ABCD23')
        ->and(RoomCode::normalize(null))->toBe('');
});

it('rejects malformed codes', function (string $code) {
    expect(RoomCode::isValid($code))->toBeFalse();
})->with(['', 'ABCDE', 'ABCDEFG', 'ABCDE0', 'ABCDEI', 'abcdef']);
