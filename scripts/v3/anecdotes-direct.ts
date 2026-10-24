/**
 * Wikipedia's "Did you know" anecdotes of the week, on the ingestion server (server/run-line.sh, anecdotes: Mondays
 * at 12:03 Paris). An envelope only: the line is `lib/v3/ingest/lines/anecdotes.ts`. Free, no YouTube unit, no model.
 *
 *   node --import tsx scripts/v3/anecdotes-direct.ts
 *   node --import tsx scripts/v3/anecdotes-direct.ts --dry
 *
 * Once, by hand, the English months the import of 20 October did not read: about 240 pages and a hundred thousand
 * cards, an hour or two of slow writes. From a computer rather than the server, whose small model would share its
 * memory for that long; run again, it carries on where it stopped. `--months` tries it on a few months first.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/anecdotes-direct.ts --catch-up-en --dry --months=2010/June,2018/October
 *   node --env-file=.env.local --import tsx scripts/v3/anecdotes-direct.ts --catch-up-en
 */

import type { LineResult } from '@/lib/v3/ingest/context'
import { directContext, LineLocked } from '@/lib/v3/ingest/direct'
import { emptyCounters, journalHost } from '@/lib/v3/ingest/journal'
import { catchUpEnglish, run, type AnecdotesCursor } from '@/lib/v3/ingest/lines/anecdotes'

const CATCH_UP = process.argv.includes('--catch-up-en')
const MAX_MINUTES = Number((CATCH_UP ? process.env.RANDOM_ANECDOTES_CATCH_UP_MINUTES : process.env.RANDOM_ANECDOTES_MINUTES) ?? (CATCH_UP ? 240 : 10))
const MONTHS = process.argv.find((value) => value.startsWith('--months='))?.slice('--months='.length).split(',').filter(Boolean)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => {
    console.error(`Anecdotes stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  let direct
  try {
    // One journal line and one lock for the week and the catch-up: the two never run at once.
    direct = await directContext(db, { line: 'anecdotes', journalLine: 'anecdotes', minutes: MAX_MINUTES, dryRun, host: journalHost(), youtubeDailyUnits: 0, youtubeBucket: 'anecdotes' })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ anecdotes: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }

  const startedAt = Date.now()
  const line = CATCH_UP ? catchUpEnglish : run
  const result: LineResult = await line(direct.ctx, { months: MONTHS }).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'anecdotes failed'] }))
  const cursor = result.cursor as AnecdotesCursor | undefined
  const { status, hitDeadline } = await direct.finish(result, cursor?.note)
  console.log(JSON.stringify({ anecdotes: status, mode: CATCH_UP ? 'catch-up-en' : 'week', dryRun, hitDeadline, ...result.counters, note: cursor?.note, errors: result.errors.slice(0, 8), durationMs: Date.now() - startedAt }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'anecdotes failed')
  process.exit(1)
})
