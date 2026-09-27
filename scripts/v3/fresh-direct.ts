/**
 * The fresh-of-the-day line, run on the ingestion server at 06:00 Paris.
 *
 *   node --import tsx scripts/v3/fresh-direct.ts
 *   node --import tsx scripts/v3/fresh-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/fresh.ts`. Chart pages
 * cost one unit for fifty videos; the whole plan takes about a hundred, and
 * its own bucket (300 at most) keeps it away from everything else.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type FreshCursorNote } from '@/lib/v3/ingest/lines/fresh'

const MAX_MINUTES = Number(process.env.RANDOM_FRESH_MINUTES ?? 30)
const UNITS = Number(process.env.RANDOM_FRESH_UNITS ?? 300)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Fresh stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'trend', journalLine: 'fresh', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: UNITS, youtubeBucket: 'fresh' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ fresh: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'fresh failed'] }))
  const cursor = result.cursor as FreshCursorNote | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ fresh: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 5), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'fresh failed')
  process.exit(1)
})
