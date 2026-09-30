# HabitaLibre Meta Direct Publisher

Deterministic publishing stage for HabitaLibre without requiring Metricool API access.

## Flow

Canva Creative Worker → `meta-autopilot/ready/` → GitHub Action → Meta Graph API → Instagram + Facebook → `meta-autopilot/sent/`

Metricool can remain connected for analytics and best-time data, while publishing happens directly through Meta.

## Why media is ingested immediately

Canva full-resolution export URLs are signed and temporary. As soon as a READY job arrives, the GitHub Action downloads the final creative and stores a durable copy under `meta-autopilot/media/`. Future publishing uses the public raw GitHub URL, not the expiring Canva URL.

## Required GitHub secret

Add one Repository Secret in this repository:

- `META_SYSTEM_USER_TOKEN`

Do not commit or paste the token into source code.

Configured Page ID:
- HabitaLibre Facebook Page: `880545785145111`

The publisher resolves the linked Instagram Business account automatically from the Page.

## Meta permissions

The Meta app/system user should have access to the HabitaLibre Page and publishing permissions needed for the chosen Instagram/Facebook API setup, including Page publishing and Instagram content publishing.

For the Facebook Login based Instagram API, Meta's current publishing examples use permissions including:
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## Queue job example

```json
{
  "id": "hl-story-documents-001",
  "publishAt": "2026-10-01T12:45:00-05:00",
  "format": "story",
  "channels": ["instagram", "facebook"],
  "caption": "",
  "media": ["https://temporary-canva-export-url.example/final.png"],
  "sourceDesignId": "DAHWruL7o-U"
}
```

Supported image formats:
- Feed single image
- Feed carousel
- Instagram image Story
- Facebook Page image Story

## Safety / retry behavior

- Jobs are immutable in READY.
- Channel progress is stored separately in `meta-autopilot/state/`.
- If Instagram succeeds and Facebook fails, a retry skips Instagram and only retries Facebook.
- A job moves to SENT only after every requested channel succeeds.
- GitHub Actions runs every 15 minutes for due jobs.
