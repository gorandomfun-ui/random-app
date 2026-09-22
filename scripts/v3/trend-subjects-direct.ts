/**
 * The trend-subjects line, run directly on GitHub.
 *
 *   node --import tsx scripts/v3/trend-subjects-direct.ts
 *   node --import tsx scripts/v3/trend-subjects-direct.ts --dry
 *
 * An envelope only: the line is `lib/v3/ingest/lines/trend-subjects.ts`, in
 * the runner's form; this builds the minimal context the runner will build
 * (deadline, journal, lock, quota, admission) and reports.
 */

import { appendFileSync } from 'node:fs'

import { directContext, installTrendIndexes, LineLocked } from '@/lib/v3/ingest/direct'
import { run } from '@/lib/v3/ingest/lines/trend-subjects'
import { emptyCounters } from '@/lib/v3/ingest/journal'
import type { LineResult } from '@/lib/v3/ingest/context'
import { count } from './reportFormat'

const MAX_MINUTES = Number(process.env.RANDOM_TREND_SUBJECTS_MINUTES ?? 25)
const DAILY_UNITS = Number(process.env.RANDOM_YT_TREND_DAILY_UNITS ?? 2000)

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  setTimeout(() => { console.error(`Trend subjects stopped at its ${MAX_MINUTES}-minute deadline; the journal shows the run as interrupted.`); process.exit(1) }, (MAX_MINUTES + 1) * 60_000).unref()

  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  if (!dryRun) await installTrendIndexes(db).catch((error) => console.warn('Indexes not installed:', error instanceof Error ? error.message : error))
  let direct
  try {
    direct = await directContext(db, { line: 'trend', journalLine: 'trend-subjects', minutes: MAX_MINUTES, dryRun, host: 'github', youtubeDailyUnits: DAILY_UNITS })
  } catch (error) {
    if (error instanceof LineLocked) { console.log(JSON.stringify({ trendSubjects: 'skipped', reason: 'locked' })); process.exit(0) }
    throw error
  }
  const startedAt = Date.now()
  const result: LineResult = await run(direct.ctx).catch((error) => ({ counters: emptyCounters(), errors: [error instanceof Error ? error.message : 'trend-subjects failed'] }))
  const { status, hitDeadline } = await direct.finish(result)
  const subjects = ((result.cursor as { subjects?: Array<{ label: string; score: number; sources: string[]; countries: string[]; universe: string }> } | undefined)?.subjects ?? [])
  console.log(JSON.stringify({ trendSubjects: status, dryRun, hitDeadline, ...result.counters, youtubeUnits: direct.ctx.quota.spent(), subjects: subjects.map((s) => s.label), errors: result.errors, durationMs: Date.now() - startedAt }))

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '\n## Tendances-sujets (direct)',
      `Statut **${status}**${dryRun ? ' (à blanc)' : ''} · examinés ${count(result.counters.scanned)} · insérés ${count(result.counters.inserted)} · doublons ${count(result.counters.duplicates)} · unités YouTube ${direct.ctx.quota.spent()} · ${Math.round((Date.now() - startedAt) / 1000)} s`,
      '', '| Sujet | Score | Sources | Pays | Univers |', '| --- | ---: | --- | --- | --- |',
      ...subjects.map((s) => `| ${s.label} | ${s.score} | ${s.sources.join(', ')} | ${s.countries.join(', ')} | ${s.universe} |`),
      ...(Object.keys(result.counters.rejected).length ? ['', `Refusés : ${Object.entries(result.counters.rejected).map(([reason, n]) => `${reason} ${n}`).join(' · ')}`] : []),
      ...(result.errors.length ? ['', ...result.errors.map((line) => `- ${line}`)] : []), '',
    ].join('\n'))
  }
  process.exit(status === 'failed' ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'trend-subjects failed')
  process.exit(1)
})
