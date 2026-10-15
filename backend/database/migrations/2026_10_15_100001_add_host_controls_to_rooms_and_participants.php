<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->string('name', 40)->nullable()->after('code');
            $table->boolean('allow_song_additions')->default(true)->after('requires_approval');
            $table->boolean('guests_can_skip')->default(false)->after('allow_song_additions');
            $table->foreignId('current_queue_item_id')->nullable()->after('guests_can_skip')
                ->constrained('queue_items')->nullOnDelete();
            $table->string('playback_status', 16)->default('playing')->after('current_queue_item_id');
            $table->timestamp('paused_at')->nullable()->after('playback_status');
            $table->unsignedInteger('paused_seconds')->default(0)->after('paused_at');
        });

        Schema::table('participants', function (Blueprint $table) {
            $table->boolean('can_add_songs')->default(true)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->dropColumn('can_add_songs');
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_queue_item_id');
            $table->dropColumn(['name', 'allow_song_additions', 'guests_can_skip', 'playback_status', 'paused_at', 'paused_seconds']);
        });
    }
};
