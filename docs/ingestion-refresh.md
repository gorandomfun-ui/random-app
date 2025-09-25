# Ingestion Refresh Roadmap

## Current pain points
- Many ingestion routes (`app/api/ingest/*`) duplicate connectivity logic, use `any`, and write partial documents (missing `tags`, `keywords`, provider metadata).  
- Random selectors now expect fully enriched documents; legacy records fall back to inferred tags via scoring, leading to repeated fallbacks and inconsistent experience.
- Cron jobs and manual ingest endpoints diverge (different headers, error handling, timeouts), making debugging harder.  
- Frontend components assume minimal random payloads; richer metadata (tags, providers, topics) is not surfaced or tested.

## Goals
1. **Consistent document shape** for `quote`, `fact`, `joke`, `image`, `video`, `web` items (including `tags`, `keywords`, `provider`, `source`, `lastShownAt`).
2. **Shared ingestion utilities** that encapsulate fetch timeouts, metadata extraction, and Mongo upserts.
3. **Typed ingestion responses** so we can re-enable `eslint` rules (remove lingering `any`).
4. **Selector + ingestion parity** – the same helper that scores a document should be able to create it.
5. **Frontend awareness** – expose (and optionally display) provider/topic metadata without breaking existing UI.

## Architecture plan
- Create `lib/random/data.ts` (done) for DB helpers (touch/upsert/sample) used by API and selectors.
- Move selection logic into dedicated modules (done for `quotes`, `facts`, `jokes`, `images`, `videos`).
- Add `create*Document` helpers alongside each selector so ingestion routes can enrich docs in a single call.  
- Introduce `lib/ingest/http.ts` (pending) for shared fetch-with-timeout, UA headers, and retry/backoff.
- Refactor ingestion routes to:
  - pull sources (GitHub dumps, APIs),
  - normalize text,
  - call the relevant `create*Document` helper,
  - upsert with shared DB utilities from `lib/random/data.ts`.
- Once ingestion routes are typed, re-enable linting (remove `// eslint-disable`) and rely on shared types exported from selector modules (`QuoteDocument`, `FactDocument`, `JokeDocument`).

## Implementation stages
1. **Selectors + helpers** – expose `createQuoteDocument`, `createFactDocument`, `createJokeDocument` (in progress).  
2. **Text ingestion routes** – swap existing logic to use the new helpers, add TypeScript types, consolidate fetch wrappers.  
3. **Image/video ingestion** – reuse `buildImageDocument` / `buildVideoDocument` from `lib/ingest/images|videos.ts` and ensure they include `tags`, `keywords`, `provider` before `upsert`.  
4. **Cron job alignment** – update `/api/cron/*` routes to import the same ingestion helpers instead of duplicating fetch logic.  
5. **Frontend surfacing** – extend `RandomContentRenderer` & modal components to optionally show provider/topic badges (behind a feature flag), and update tests/snapshots accordingly.

## Frontend adjustments (later stage)
- Add optional badges for `item.provider`, `item.source.name`, top `tags` on the random modal/card components.
- Provide filters or sorting in admin dashboards using the richer metadata.
- Update Storybook/examples (if any) to cover new fields.

## Immediate next steps
- Export document builders from `lib/random/{quotes,facts,jokes}.ts` and update text ingestion routes to use them (removes ~70% of `any` usage in those files).
- Create `lib/ingest/http.ts` with the shared fetch-with-timeout used by ingestion endpoints.
- Backfill existing Mongo records (one-off script) to populate `tags`/`keywords` for older entries (will schedule after refactor stabilizes).
