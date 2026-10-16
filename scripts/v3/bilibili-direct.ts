/**
 * Bilibili's videos for a computer, on the ingestion server (server/run-line.sh, bilibili: twice a day, after the
 * languages). An envelope only: the line is `lib/v3/ingest/lines/bilibili.ts`. Free, no YouTube unit.
 *
 *   node --import tsx scripts/v3/bilibili-direct.ts
 *   node --import tsx scripts/v3/bilibili-direct.ts --dry
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type BilibiliCursor } from '@/lib/v3/ingest/lines/bilibili'

const MAX_MINUTES = Number(process.env.RANDOM_BILIBILI_MINUTES ?? 10)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Bilibili stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'bilibili', journalLine: 'bilibili', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0, youtubeBucket: 'bilibili' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ bilibili: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'bilibili failed'] }))
  const cursor = result.cursor as BilibiliCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ bilibili: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'bilibili failed')
  process.exit(1)
})
