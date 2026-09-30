# HabitaLibre Social Autopilot Publisher

This repository contains the deterministic publisher stage for HabitaLibre social content.

## Pipeline

1. ChatGPT/Canva Creative Worker creates and QA-checks a final design.
2. The Creative Worker writes one JSON job into `autopilot/ready/`.
3. GitHub Actions runs `.github/workflows/habitalibre-metricool-publisher.yml`.
4. The publisher calls Metricool's REST scheduler API.
5. On success, the job is moved to `autopilot/sent/` with a receipt.
6. On failure, the JSON stays in `autopilot/ready/` so it can be retried.

The publisher is intentionally **draft-only by default** (`draft=true`, `autoPublish=false`) until the end-to-end pipeline is fully validated.

## Required GitHub secret

Create this repository secret:

- `METRICOOL_API_TOKEN` — Metricool REST API access token from **Metricool → Account Settings → API**.

Do not commit the token to the repository.

Metricool identifiers already configured in the workflow:

- userId: `5522469`
- blogId: `7140882`
- timezone used by content jobs: `America/Guayaquil`

## Queue JSON contract

Example Story job:

```json
{
  "id": "hl-story-2026-10-01-documents",
  "publicationDate": {
    "dateTime": "2026-10-01T12:45:00",
    "timezone": "America/Guayaquil"
  },
  "text": "",
  "providers": [
    { "network": "instagram" },
    { "network": "facebook" }
  ],
  "media": [
    "https://public-or-temporary-render.example/final.png"
  ],
  "mediaAltText": [
    "HabitaLibre: ordena tus documentos antes de evaluar opciones de financiamiento."
  ],
  "draft": true,
  "autoPublish": false,
  "facebookData": { "type": "STORY" },
  "instagramData": {
    "type": "STORY",
    "showReelOnFeed": true,
    "isAiGenerated": true
  }
}
```

Metricool is instructed to copy external media immediately with `saveExternalMediaFiles=true`.

## Safety behavior

- Missing token → workflow fails without deleting the READY job.
- Metricool HTTP error → workflow fails and the READY job remains.
- Success → source job is removed from READY and a full receipt is written under SENT.
