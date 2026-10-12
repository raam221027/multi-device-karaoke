<?php

it('reports the API and database as healthy', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok', 'db' => true])
        ->assertJsonStructure(['status', 'db', 'time']);
});
