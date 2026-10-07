/**
 * The look-alikes of the likes, run on the ingestion server in windows of its
 * own (server/run-line.sh, lookalike: eight of thirty minutes a day) and in
 * the minutes the fingerprints leave (server/vec-window.sh).
 *
 *   RANDOM_LOOKALIKE_MINUTES=30 node --import tsx scripts/v3/lookalike-direct.ts
 *   node --import tsx scripts/v3/lookalike-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/lookalike.ts`. It loads
 * the small model (700 MB), so it runs alone on the machine, as the
 * fingerprints do; Dailymotion is free, the likes' YouTube channels cost a
 * few hundred units a day (RANDOM_LOOKALIKE_YOUTUBE_UNITS).
 */

import { disposeModel, fingerprints } from '@/lib/v3/ai/fingerprint'
import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type LookalikeCursor } from '@/lib/v3/ingest/lines/lookalike'

const MAX_MINUTES = Number(process.env.RANDOM_LOOKALIKE_MINUTES ?? 15)
/** YouTube units a day for the likes' channels (the dig keeps its 7,000; the day leaves 2,600): about 250 are used over the sixty-one YouTube likes. */
const YOUTUBE_UNITS = Number(process.env.RANDOM_LOOKALIKE_YOUTUBE_UNITS ?? 400)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Look-alikes stopped at their ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 2) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'lookalike', journalLine: 'lookalike', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: YOUTUBE_UNITS, youtubeBucket: 'lookalike' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ lookalike: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx, { prints: (texts) => fingerprints(texts) }).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'look-alikes failed'] }))
  const cursor = result.cursor as LookalikeCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ lookalike: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  // The model's threads are let go before the exit, as the fingerprints' script does: an immediate exit aborts in the runtime's teardown.
  await disposeModel().catch(() => undefined)
  process.exitCode = status === 'failed' ? 1 : 0
  setTimeout(() => process.exit(), 200).unref()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'look-alikes failed')
  process.exit(1)
})
