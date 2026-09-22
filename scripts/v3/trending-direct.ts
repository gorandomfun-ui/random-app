/**
 * The trending line, run directly on GitHub.
 *
 *   node --import tsx scripts/v3/trending-direct.ts
 *   node --import tsx scripts/v3/trending-direct.ts --regions=FR,DE --limit=50 --dry
 *
 * The phase code is Vercel's, without Vercel: called through HTTP it was
 * cut at 240 s by its caller and at 300 s by the platform, and inserting a
 * hundred videos on this database takes longer than that — the line looked
 * "active" and inserted nothing for ten days. Here it has twelve minutes,
 * is written to the journal when it starts and judged when it ends, and a
 * run killed at its deadline is on record as interrupted.
 */

import { appendFileSync } from 'node:fs'

import { closeRun, emptyCounters, journalHost, judge, openRun, type RunCounters } from '@/lib/v3/ingest/journal'
import { ingestTrendingVideos, pickTrendingRegions } from '@/lib/ingest/videos'
import { count } from './reportFormat'

const MAX_MINUTES = Number(process.env.RANDOM_TRENDING_MINUTES ?? 12)

const flag = (name: string) => process.argv.includes(`--${name}`)
const valueFlag = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1]

async function main(): Promise<void> {
  const dryRun = flag('dry')
  const regions = (valueFlag('regions')?.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? []).slice(0, 2)
  const chosen = regions.length === 2 ? regions : pickTrendingRegions()
  const limit = Math.min(50, Math.max(10, Number(valueFlag('limit') ?? 50) || 50))

  // Killed at its own deadline rather than left hanging: the journal keeps the open run as "interrompu".
  setTimeout(() => {
    console.error(`Trending stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`)
    process.exit(1)
  }, MAX_MINUTES * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const startedAt = new Date()
  const runId = await openRun(db, { line: 'trend', startedAt, host: journalHost(), dryRun }).catch(() => null)
  console.log(JSON.stringify({ trending: 'start', regions: chosen, limit, dryRun }))

  let counters: RunCounters = emptyCounters()
  let errors: string[] = []
  try {
    const result = await ingestTrendingVideos(chosen, { dryRun, limitPerProvider: limit, skipDetails: true, insertOnly: true })
    const raw = result as unknown as Record<string, unknown>
    const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    counters = {
      scanned: number(raw.scanned),
      inserted: number(raw.inserted),
      duplicates: number(raw.existingSkipped),
      rejected: number(raw.skippedInvalid) ? { invalid: number(raw.skippedInvalid) } : {},
    }
    const warnings = Array.isArray(raw.warnings) ? (raw.warnings as Array<{ label?: string; message?: string }>) : []
    errors = warnings.map((warning) => [warning.label, warning.message].filter(Boolean).join(' : ')).slice(0, 10)
    console.log(JSON.stringify({ trending: 'done', regions: chosen, ...counters, providerCounts: raw.providerCounts ?? {}, warnings: errors }))
  } catch (error) {
    errors = [error instanceof Error ? error.message : 'trending failed']
    console.error('Trending failed:', errors[0])
  }

  const finishedAt = new Date()
  const status = judge(counters, errors, false)
  if (runId) await closeRun(db, runId, { finishedAt, status, counters, errors }).catch(() => console.warn('Journal unavailable; the run itself is unaffected.'))

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '\n## Tendances (direct)',
      `Régions ${chosen.join(' / ')} · statut **${status}** · examinés ${count(counters.scanned)} · insérés ${count(counters.inserted)} · doublons ${count(counters.duplicates)} · ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)} s`,
      ...(errors.length ? ['', ...errors.map((line) => `- ${line}`)] : []), '',
    ].join('\n'))
  }
  console.log(JSON.stringify({ trending: status, durationMs: finishedAt.getTime() - startedAt.getTime() }))
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'trending failed')
  process.exit(1)
})
