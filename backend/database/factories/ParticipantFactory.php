<?php

namespace Database\Factories;

use App\Enums\ParticipantRole;
use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Participant>
 */
class ParticipantFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id' => Room::factory(),
            'role' => ParticipantRole::Guest,
            'display_name' => fake()->firstName(),
            'status' => ParticipantStatus::Approved,
        ];
    }

    public function host(): static
    {
        return $this->state(['role' => ParticipantRole::Host]);
    }

    public function guest(): static
    {
        return $this->state(['role' => ParticipantRole::Guest]);
    }

    public function display(): static
    {
        return $this->state(['role' => ParticipantRole::Display, 'display_name' => 'PC', 'device' => 'PC']);
    }
}
