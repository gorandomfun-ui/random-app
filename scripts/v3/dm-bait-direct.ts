/**
 * The night's check for piracy bait on Dailymotion, on the ingestion server (server/run-line.sh, dm-bait): the accounts
 * whose undescribed videos entered in the last day, each asked once; a bait account is listed for the door, its rows
 * saved under RANDOM_BACKUP_DIR/dm-bait (/home/random/backups on the server), then deleted.
 *
 *   node --import tsx scripts/v3/dm-bait-direct.ts                  the night's accounts
 *   node --import tsx scripts/v3/dm-bait-direct.ts --base           then, in the time left, a bounded number of the base's
 *   node --import tsx scripts/v3/dm-bait-direct.ts --dry            asks and judges; writes nothing, not even the journal
 *   node --import tsx scripts/v3/dm-bait-direct.ts --dry --max=30   the first thirty accounts of the night only
 *
 * An envelope only: the line is lib/v3/ingest/lines/dm-bait.ts. No model, no YouTube unit, little memory.
 */

import type { LineContext, LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run } from '@/lib/v3/ingest/lines/dm-bait'

const MAX_MINUTES = Number(process.env.RANDOM_DM_BAIT_MINUTES ?? 25)

function numberArg(name: string): number | undefined {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const value = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  const base = process.argv.includes('--base')
  const max = numberArg('max')
  setTimeout(() => {
    console.error(`Bait check stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 3) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const startedAt = Date.now()
  const deps = { base, ...(max !== undefined ? { windowAsks: max, baseAsks: Math.min(max, 1500) } : {}) }
  const failed = (error: unknown): LineResult => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'bait check failed'] })

  // A rehearsal writes nothing at all: no lock, no journal, no verdict, no list, no file, no deletion.
  if (dryRun) {
    const deadline = startedAt + MAX_MINUTES * 60_000
    const ctx: LineContext = {
      db, line: 'dm-bait', deadline, timeLeft: () => deadline - Date.now(), dryRun: true, cursor: null,
      quota: { reserve: async () => false, spent: () => 0 },
      admit: async () => { throw new Error('the bait check admits nothing') },
      search: async () => undefined,
      log: (text: string) => console.log(`[dm-bait] ${text}`),
    }
    const result = await run(ctx, deps).catch(failed)
    const note = (result.cursor as { note?: string } | undefined)?.note
    console.log(JSON.stringify({ dmBait: 'dry', asked: result.counters.scanned, rejected: result.counters.rejected, note, bait: (result.cursor as { bait?: string[] } | undefined)?.bait ?? [], errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
    setTimeout(() => process.exit(0), 200).unref()
    return
  }

  let direct
  try {
    direct = await directContext(db, { line: 'dm-bait', journalLine: 'dm-bait', minutes: MAX_MINUTES, dryRun: false, host: journalHost(), youtubeDailyUnits: 0, checkOnly: true })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ dmBait: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const result = await run(direct.ctx, deps).catch(failed)
  const note = (result.cursor as { note?: string } | undefined)?.note
  const { status, hitDeadline } = await direct.finish(result, note)
  console.log(JSON.stringify({ dmBait: status, hitDeadline, asked: result.counters.scanned, rejected: result.counters.rejected, note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  process.exitCode = status === 'failed' ? 1 : 0
  setTimeout(() => process.exit(), 200).unref()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'bait check failed')
  process.exit(1)
})
