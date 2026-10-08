/**
 * The nightly check of the stored videos, on the ingestion server
 * (server/run-line.sh, obsolete): the dead are marked and hidden from the
 * site; the owner deletes them from public/erase-obsolete-videos.html.
 *
 *   node --import tsx scripts/v3/obsolete-direct.ts
 *   node --import tsx scripts/v3/obsolete-direct.ts --dry      judges, writes nothing
 *
 * An envelope only: the line is lib/v3/ingest/lines/obsolete.ts. No model,
 * little memory; YouTube in its own bucket of units (RANDOM_OBSOLETE_YOUTUBE_UNITS).
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run } from '@/lib/v3/ingest/lines/obsolete'

const MAX_MINUTES = Number(process.env.RANDOM_OBSOLETE_MINUTES ?? 35)
/** YouTube units a night: the dig keeps its 7,000, the day leaves about 2,300 once the look-alikes took theirs. */
const YOUTUBE_UNITS = Number(process.env.RANDOM_OBSOLETE_YOUTUBE_UNITS ?? 500)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Obsolete check stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 3) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'obsolete', journalLine: 'obsolete', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: YOUTUBE_UNITS, youtubeBucket: 'obsolete' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ obsolete: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'obsolete check failed'] }))
  const note = (result.cursor as { note?: string } | undefined)?.note
  const { status, hitDeadline } = await direct.finish(result, note)
  console.log(JSON.stringify({ obsolete: status, dryRun, hitDeadline, checked: result.counters.scanned, rejected: result.counters.rejected, note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  process.exitCode = status === 'failed' ? 1 : 0
  setTimeout(() => process.exit(), 200).unref()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'obsolete check failed')
  process.exit(1)
})
