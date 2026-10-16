<?php

namespace App\Http\Requests;

use App\Support\RoomCode;
use Illuminate\Foundation\Http\FormRequest;

class DisplayJoinRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['code' => RoomCode::normalize($this->input('code'))]);
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'regex:/^['.RoomCode::ALPHABET.']{'.RoomCode::LENGTH.'}$/'],
            'device' => ['nullable', 'string', 'in:Mobile,Tablet,PC,TV'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'That doesn\'t look like a room code.',
        ];
    }
}
