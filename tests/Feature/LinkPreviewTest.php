<?php

namespace Tests\Feature;

use Tests\TestCase;

class LinkPreviewTest extends TestCase
{
    public function test_home_page_has_open_graph_and_twitter_card_tags(): void
    {
        $html = $this->get(route('home'))->assertOk()->getContent();

        foreach ([
            '<meta property="og:title" content="점심 룰렛 — 근처 식당 돌림판">',
            '<meta property="og:type" content="website">',
            '<meta property="og:image" content="'.url('/og-image.jpg').'">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            '<meta property="og:url" content="'.url('/').'">',
            '<meta name="twitter:card" content="summary_large_image">',
            '<meta name="description"',
        ] as $tag) {
            $this->assertStringContainsString($tag, (string) $html);
        }
    }

    public function test_preview_image_and_icons_exist(): void
    {
        foreach (['og-image.jpg', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png'] as $file) {
            $this->assertFileExists(public_path($file));
        }

        [$width, $height] = getimagesize(public_path('og-image.jpg')) ?: [0, 0];
        $this->assertSame([1200, 630], [$width, $height]);
    }
}
