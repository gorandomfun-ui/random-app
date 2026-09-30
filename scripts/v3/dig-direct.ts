/**
 * The dig, run on the ingestion server several times a day.
 *
 *   node --import tsx scripts/v3/dig-direct.ts
 *   node --import tsx scripts/v3/dig-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/dig.ts`. Its YouTube
 * units are counted in their own bucket, "dig", shared by the day's runs:
 * RANDOM_DIG_UNITS for the whole day, RANDOM_DIG_RUN_UNITS for one run.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type DigCursorNote } from '@/lib/v3/ingest/lines/dig'

const MAX_MINUTES = Number(process.env.RANDOM_DIG_MINUTES ?? 40)
/**
 * The day's units, and each run's share of them: the first run of 30 September
 * took the whole day in half an hour and met YouTube's own "search queries per
 * day" limit before our counter did; the two later runs found nothing left.
 * Seven thousand a day keeps under that limit with the fresh list; a run
 * takes at most its share, so the three runs each serve their turn of the world.
 */
const UNITS = Number(process.env.RANDOM_DIG_UNITS ?? 7000)
const RUN_UNITS = Number(process.env.RANDOM_DIG_RUN_UNITS ?? 2600)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Dig stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  // This run's ceiling: what the day already spent, plus its share, never past the day's units.
  const { quotaDay } = await import('@/lib/discovery/exploration')
  const spent = Number((await db.collection('discovery_quota_v2').findOne({ _id: `${quotaDay(Date.now())}:youtube:dig` } as never, { projection: { spent: 1 } }).catch(() => null))?.spent ?? 0)
  const ceiling = Math.min(UNITS, spent + RUN_UNITS)
  let direct
  try {
    direct = await directContext(db, { line: 'dig', journalLine: 'dig', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: ceiling, youtubeBucket: 'dig' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ dig: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'dig failed'] }))
  const cursor = result.cursor as DigCursorNote | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ dig: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, ceiling, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'dig failed')
  process.exit(1)
})
