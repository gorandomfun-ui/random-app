/**
 * The drift, run on the ingestion server a few times a day.
 *
 *   node --import tsx scripts/v3/drift-direct.ts
 *   node --import tsx scripts/v3/drift-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/drift.ts`. It spends no
 * YouTube unit: Dailymotion's related videos and uploaders are free.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type DriftCursor } from '@/lib/v3/ingest/lines/drift'

const MAX_MINUTES = Number(process.env.RANDOM_DRIFT_MINUTES ?? 15)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Drift stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'drift', journalLine: 'drift', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0, youtubeBucket: 'drift' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ drift: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'drift failed'] }))
  const cursor = result.cursor as DriftCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ drift: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'drift failed')
  process.exit(1)
})
