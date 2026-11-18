<?php

namespace Tests\Feature;

use Tests\TestCase;

class RedirectToSecureUrlTest extends TestCase
{
    public function test_plain_http_page_requests_go_to_the_https_app_url(): void
    {
        config(['app.force_https' => true, 'app.url' => 'https://lunch.example.test']);

        $this->get('http://203.0.113.10:8001/?from=ip')
            ->assertRedirect('https://lunch.example.test/?from=ip');
    }

    public function test_https_requests_are_served_as_is(): void
    {
        config(['app.force_https' => true, 'app.url' => 'https://lunch.example.test']);

        $this->get('https://lunch.example.test/')->assertOk();
    }

    public function test_nothing_changes_when_disabled(): void
    {
        config(['app.force_https' => false, 'app.url' => 'https://lunch.example.test']);

        $this->get('http://203.0.113.10:8001/')->assertOk();
    }
}
