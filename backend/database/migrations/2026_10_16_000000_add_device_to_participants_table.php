<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Set only for a screen that joined by code (Mobile, Tablet, PC, TV): nobody's phone. */
    public function up(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->string('device', 16)->nullable()->after('display_name');
        });

        DB::table('participants')
            ->where('role', 'display')
            ->where('display_name', 'Display')
            ->update(['device' => 'Screen', 'display_name' => 'Screen']);
    }

    public function down(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->dropColumn('device');
        });
    }
};
