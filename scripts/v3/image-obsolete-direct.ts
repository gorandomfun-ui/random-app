/**
 * The night's check of the stored pictures and GIFs, on the ingestion server (server/run-line.sh, image-obsolete): the dead
 * are marked; the owner deletes them from public/erase-obsolete-videos.html, each checked once more first.
 *
 *   node --import tsx scripts/v3/image-obsolete-direct.ts
 *   node --import tsx scripts/v3/image-obsolete-direct.ts --dry      checks, writes nothing
 *
 * An envelope only: the line is lib/v3/ingest/lines/image-obsolete.ts. No model, no quota, little memory.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run } from '@/lib/v3/ingest/lines/image-obsolete'

const MAX_MINUTES = Number(process.env.RANDOM_IMAGE_OBSOLETE_MINUTES ?? 30)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Image check stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 3) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'image-obsolete', journalLine: 'image-obsolete', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0, checkOnly: true })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ imageObsolete: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'image check failed'] }))
  const note = (result.cursor as { note?: string } | undefined)?.note
  const { status, hitDeadline } = await direct.finish(result, note)
  console.log(JSON.stringify({ imageObsolete: status, dryRun, hitDeadline, checked: result.counters.scanned, rejected: result.counters.rejected, note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  process.exitCode = status === 'failed' ? 1 : 0
  setTimeout(() => process.exit(), 200).unref()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'image check failed')
  process.exit(1)
})
