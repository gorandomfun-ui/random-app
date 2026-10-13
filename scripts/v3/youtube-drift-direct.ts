/**
 * The YouTube drift, run on the ingestion server (server/run-line.sh,
 * youtube-drift): the channels of the YouTube videos the base took these last
 * days, five new uploads of each, through the drift's doors and the mix.
 *
 *   node --import tsx scripts/v3/youtube-drift-direct.ts
 *   node --import tsx scripts/v3/youtube-drift-direct.ts --dry
 *
 * An envelope only: the line is lib/v3/ingest/lines/youtube-drift.ts. Its
 * units are counted in their own bucket (RANDOM_YT_DRIFT_UNITS a day): the
 * part of YouTube's 10,000 the searches and the other lines leave.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type YouTubeDriftCursor } from '@/lib/v3/ingest/lines/youtube-drift'

const MAX_MINUTES = Number(process.env.RANDOM_YT_DRIFT_MINUTES ?? 25)
/**
 * Units a day, and for one run. 1,600 until 13 October, spent by the first run of the day (2,239 videos), while Google's
 * counter showed 5,065 of the 10,000 used on 12 October. The owner: "si elles ne sont pas utilisées, oui". 6,000 leaves
 * about 4,000 to the other lines (they used some 3,500), and each of the four runs takes its quarter, so the drift reads
 * the channels that entered through the day. About 18 KB sent per unit: some 80 MB a day more under the 2 € brake.
 */
const UNITS = Number(process.env.RANDOM_YT_DRIFT_UNITS ?? 6000)
const RUN_UNITS = Number(process.env.RANDOM_YT_DRIFT_RUN_UNITS ?? 1500)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`YouTube drift stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 2) * 60_000).unref()
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  // This run's ceiling: what the day already spent, plus its share, never past the day's units.
  const { quotaDay } = await import('@/lib/discovery/exploration')
  const spent = Number((await db.collection('discovery_quota_v2').findOne({ _id: `${quotaDay(Date.now())}:youtube:youtube-drift` } as never, { projection: { spent: 1 } }).catch(() => null))?.spent ?? 0)
  const ceiling = Math.min(UNITS, spent + RUN_UNITS)
  let direct
  try {
    direct = await directContext(db, { line: 'youtube-drift', journalLine: 'youtube-drift', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: ceiling, youtubeBucket: 'youtube-drift' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ youtubeDrift: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'youtube drift failed'] }))
  const cursor = result.cursor as YouTubeDriftCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ youtubeDrift: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'youtube drift failed')
  process.exit(1)
})
