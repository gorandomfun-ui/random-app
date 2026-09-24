/**
 * The pools line, run directly on the ingestion server every night.
 *
 *   node --import tsx scripts/v3/pools-direct.ts
 *   node --import tsx scripts/v3/pools-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/pools.ts`, on the
 * runner's contract; this builds the minimal context (deadline, journal,
 * lock, admission — no YouTube budget at all) and reports.
 */

import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { run, type PoolsCursor } from '@/lib/v3/ingest/lines/pools'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import type { LineResult } from '@/lib/v3/ingest/context'

const MAX_MINUTES = Number(process.env.RANDOM_POOLS_MINUTES ?? 40)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => { console.error(`Pools stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`); process.exit(1) }, (MAX_MINUTES + 1) * 60_000).unref()
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'pools', journalLine: 'pools', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0 })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ pools: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'pools failed'] }))
  const cursor = result.cursor as PoolsCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ pools: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 5), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'pools failed')
  process.exit(1)
})
