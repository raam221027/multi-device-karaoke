<?php

namespace Database\Factories;

use App\Enums\RoomStatus;
use App\Support\RoomCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Room>
 */
class RoomFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => RoomCode::random(),
            'status' => RoomStatus::Open,
        ];
    }

    public function locked(): static
    {
        return $this->state(['is_locked' => true]);
    }

    public function closed(): static
    {
        return $this->state([
            'status' => RoomStatus::Closed,
            'closed_at' => now(),
        ]);
    }
}
