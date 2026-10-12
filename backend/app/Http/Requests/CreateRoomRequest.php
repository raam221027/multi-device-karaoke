<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateRoomRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'display_name' => ['required', 'string', 'min:1', 'max:30'],
        ];
    }
}
