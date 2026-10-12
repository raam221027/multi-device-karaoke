<?php

namespace App\Http\Requests;

use App\Support\RoomCode;
use Illuminate\Foundation\Http\FormRequest;

class JoinRoomRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['code' => RoomCode::normalize($this->input('code'))]);
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'regex:/^['.RoomCode::ALPHABET.']{'.RoomCode::LENGTH.'}$/'],
            'display_name' => ['required', 'string', 'min:1', 'max:30'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'That doesn\'t look like a room code.',
        ];
    }
}
