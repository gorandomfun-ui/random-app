/**
 * The dig, run on the ingestion server several times a day.
 *
 *   node --import tsx scripts/v3/dig-direct.ts
 *   node --import tsx scripts/v3/dig-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/dig.ts`. Its YouTube
 * units are counted in their own bucket, "dig", shared by the day's runs:
 * RANDOM_DIG_UNITS for the whole day (8,500 by default, the rest of the ten
 * thousand left to the fresh list and the repairs).
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type DigCursorNote } from '@/lib/v3/ingest/lines/dig'

const MAX_MINUTES = Number(process.env.RANDOM_DIG_MINUTES ?? 40)
const UNITS = Number(process.env.RANDOM_DIG_UNITS ?? 8500)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Dig stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'dig', journalLine: 'dig', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: UNITS, youtubeBucket: 'dig' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ dig: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'dig failed'] }))
  const cursor = result.cursor as DigCursorNote | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ dig: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'dig failed')
  process.exit(1)
})
