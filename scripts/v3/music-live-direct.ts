/**
 * The live music line, run on the ingestion server once a day.
 *
 *   node --import tsx scripts/v3/music-live-direct.ts
 *   node --import tsx scripts/v3/music-live-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/musicLive.ts`. Its
 * YouTube allowance (RANDOM_MUSIC_LIVE_UNITS, 1,000 by default: ten searches)
 * comes from the old daily pass running twice a day instead of four times.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type MusicLiveCursor } from '@/lib/v3/ingest/lines/musicLive'

const MAX_MINUTES = Number(process.env.RANDOM_MUSIC_LIVE_MINUTES ?? 25)
const UNITS = Number(process.env.RANDOM_MUSIC_LIVE_UNITS ?? 1000)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Music live stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'music-live', journalLine: 'music-live', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: UNITS })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ musicLive: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'music live failed'] }))
  const cursor = result.cursor as MusicLiveCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ musicLive: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 5), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'music live failed')
  process.exit(1)
})
