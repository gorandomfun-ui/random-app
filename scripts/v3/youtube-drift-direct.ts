/**
 * The YouTube drift, run on the ingestion server (server/run-line.sh,
 * youtube-drift): the channels of the YouTube videos the base took these last
 * days, twenty new uploads of each, through the drift's doors.
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
 * Units a day: two a channel, about eight videos in a channel. 1,600 is some 800 channels and 6,000 videos a day, which the
 * base, the fingerprints' windows and the nightly check absorb; YouTube's 10,000 would allow four times that, not the base.
 */
const UNITS = Number(process.env.RANDOM_YT_DRIFT_UNITS ?? 1600)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`YouTube drift stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 2) * 60_000).unref()
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'youtube-drift', journalLine: 'youtube-drift', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: UNITS, youtubeBucket: 'youtube-drift' })
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
