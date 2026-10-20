<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRoomRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'min:1', 'max:40'],
            'is_locked' => ['sometimes', 'boolean'],
            'allow_song_additions' => ['sometimes', 'boolean'],
            'guests_can_skip' => ['sometimes', 'boolean'],
            'show_side_strip' => ['sometimes', 'boolean'],
        ];
    }
}
