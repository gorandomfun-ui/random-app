/**
 * The authors line, run on the ingestion server.
 *
 *   node --import tsx scripts/v3/authors-direct.ts
 *   node --import tsx scripts/v3/authors-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/authors.ts`. It is given a
 * small YouTube allowance — two units an author, where a search costs a hundred
 * — so it can never eat into what the searching lines need.
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { run, type AuthorsCursor } from '@/lib/v3/ingest/lines/authors'

const MAX_MINUTES = Number(process.env.RANDOM_AUTHORS_MINUTES ?? 20)
/** Forty YouTube authors at two units each, and nothing taken from the rest. */
const UNITS = Number(process.env.RANDOM_AUTHORS_UNITS ?? 120)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Authors stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    direct = await directContext(db, { line: 'authors', journalLine: 'authors', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: UNITS })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ authors: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'authors failed'] }))
  const cursor = result.cursor as AuthorsCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ authors: status, dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 5), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'authors failed')
  process.exit(1)
})
