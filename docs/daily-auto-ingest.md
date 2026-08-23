# Daily Auto Ingest

New automated ingestion path for RANDOM. It is separate from `scripts/local-ingest.ts`, which stays as the manual/full local runner.

## Goal

- Keep Vercel for the site.
- Run ingestion from an external scheduler such as GitHub Actions.
- Call small, measurable phases instead of one long request.
- Keep daily video ingestion biased toward YouTube while still using Dailymotion as a complement.

## Phases

- `trending`: YouTube + Dailymotion daily trends for two rotating regions.
- `retro`: retro discovery queries built for public-access/VHS/archive style content.
- `combo-videos`: RANDOM-style keyword combinations, with YouTube-only chunks first.
- `web`: web ingestion with daily RANDOM queries.

Endpoint:

```txt
/api/ingest/daily-auto?phase=trending
/api/ingest/daily-auto?phase=retro
/api/ingest/daily-auto?phase=combo-videos
/api/ingest/daily-auto?phase=web
```

Authentication uses `ADMIN_INGEST_KEY` via `x-admin-ingest-key`.

## GitHub Actions

Workflow: `.github/workflows/daily-auto-ingest.yml`

Required repository secrets:

```txt
RANDOM_INGEST_HOST=https://your-vercel-domain
ADMIN_INGEST_KEY=...
```

Optional repository variables:

```txt
DAILY_AUTO_MIN_VIDEO_INSERTED=600
DAILY_AUTO_MAX_VIDEO_CHUNKS=24
DAILY_AUTO_MAX_RUNTIME_MINUTES=110
DAILY_AUTO_CONTINUE_CHUNK_INSERTED=20
```

Manual run:

```sh
HOST="https://your-vercel-domain" ADMIN_INGEST_KEY="..." npm run daily:auto
```

Dry run:

```sh
DRY_RUN=1 HOST="https://your-vercel-domain" ADMIN_INGEST_KEY="..." npm run daily:auto
```
