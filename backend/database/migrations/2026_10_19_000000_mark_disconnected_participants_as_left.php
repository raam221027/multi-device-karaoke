<?php

use App\Models\Participant;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Leaving used to only drop the device's token, so the participant stayed
     * listed and could still be handed a role. Mark those as left.
     */
    public function up(): void
    {
        DB::table('participants')
            ->where('status', 'approved')
            ->whereNotExists(fn ($q) => $q->from('personal_access_tokens')
                ->whereColumn('personal_access_tokens.tokenable_id', 'participants.id')
                ->where('personal_access_tokens.tokenable_type', Participant::class))
            ->update(['status' => 'left']);
    }

    public function down(): void
    {
        //
    }
};
