/**
 * The human-curated feeds line, run on the ingestion server.
 *
 *   node --import tsx scripts/v3/feeds-direct.ts
 *   node --import tsx scripts/v3/feeds-direct.ts --dry
 *
 * Communities where people already did the sorting: obscure finds, vintage
 * archives, documentaries, things that are beautiful or bluffing. Each one is
 * read from four angles — rising, top of the week, top of the month, newest —
 * and a bookmark per community and per angle keeps the same posts from being
 * read twice.
 *
 * It costs almost nothing: the communities are free to read, and the videos
 * found are checked fifty at a time, one unit a batch, where a single search
 * costs a hundred. The whole night comes to less than one search.
 *
 * The work itself is `lib/ingest/videoFeeds.ts`, written long ago and never
 * once scheduled; this is the envelope that runs it and writes the journal.
 */

import { ingestVideoFeeds } from '@/lib/ingest/videoFeeds'
import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'

const MAX_MINUTES = Number(process.env.RANDOM_FEEDS_MINUTES ?? 25)
const LIMIT = Number(process.env.RANDOM_FEEDS_LIMIT ?? 0) || undefined

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Feeds stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'feeds', journalLine: 'feeds', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0 })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ feeds: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const outcome = await ingestVideoFeeds({ dryRun, redditLimit: LIMIT }).then(
    (value) => ({ value, error: null as string | null }),
    (error: unknown) => ({ value: null, error: error instanceof Error ? error.message : 'feeds failed' }),
  )

  const counters = emptyCounters()
  let note: string | undefined
  const errors: string[] = []
  if (outcome.value) {
    const { scanned, unique, inserted, updated, insertedByProvider, warnings } = outcome.value
    counters.scanned = scanned
    counters.inserted = inserted
    counters.duplicates = Math.max(0, unique - inserted)
    if (insertedByProvider) counters.byProvider = insertedByProvider
    note = `${inserted} entrées · ${unique} uniques sur ${scanned} lues · ${updated} mises à jour`
    for (const warning of (warnings ?? []).slice(0, 3)) errors.push(`${warning.label} : ${warning.message ?? warning.status ?? ''}`.trim())
  } else if (outcome.error) {
    errors.push(outcome.error)
  }

  const result: LineResult = { counters, errors }
  const { status, hitDeadline } = await direct.finish(result, note)
  console.log(JSON.stringify({ feeds: status, dryRun, hitDeadline, ...counters, note, errors: errors.slice(0, 5), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'feeds failed')
  process.exit(1)
})
