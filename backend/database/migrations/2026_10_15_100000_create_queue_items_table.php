<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('queue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('added_by_participant_id')->constrained('participants')->cascadeOnDelete();
            $table->string('youtube_video_id', 16);
            $table->string('title');
            $table->string('channel_title')->nullable();
            $table->string('thumbnail_url')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->unsignedInteger('position');
            $table->string('status', 16)->default('queued');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['room_id', 'status', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_items');
    }
};
