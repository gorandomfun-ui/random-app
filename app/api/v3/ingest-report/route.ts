export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getDatabase } from '@/lib/mongodb'
import { isAdminRequest, adminUnauthorizedBody } from '@/lib/auth/adminAuth'

/**
 * What the ingestion did, by day.
 *
 * The old page summed the last thirty runs, which mixed days together and
 * hid an outage behind the days before it. Everything here is grouped by
 * calendar day in Paris time, and a line that ran without inserting anything
 * is shown as such rather than as a success.
 */

const PARIS = 'Europe/Paris'
/** Past this, a line is treated as stopped rather than quiet. */
const STALE_HOURS = 26

type PhaseRow = {
  phase?: string
  queries?: string[]
  regions?: string[]
  result?: { inserted?: number; scanned?: number; providerCounts?: Record<string, number> }
  error?: string
}

/** At most this many searches shown per line per day; the rest is noise. */
const MAX_SEARCHES_SHOWN = 24

/**
 * What the line actually went looking for. The trending line searches nothing:
 * it asks YouTube and Dailymotion what is trending in two countries, so the
 * countries are its subject.
 */
function searchesOf(source: { queries?: string[]; regions?: string[] } | undefined): string[] {
  if (!source) return []
  const regions = Array.isArray(source.regions) ? source.regions.map((code) => `pays ${code}`) : []
  const queries = Array.isArray(source.queries) ? source.queries.map(String) : []
  return [...regions, ...queries].filter(Boolean)
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  try {
    const db = await getDatabase()
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const runs = await db
      .collection('cron_runs')
      .find({ startedAt: { $gte: since } }, { sort: { startedAt: -1 }, limit: 800 })
      .toArray()

    // One bucket per day, per line — never a running total across days.
    const days = new Map<string, Map<string, { inserted: number; scanned: number; runs: number; errors: number; providers: Record<string, number>; searches: Set<string> }>>()
    const lastSeen = new Map<string, { at: Date; inserted: number }>()

    for (const run of runs) {
      const startedAt = run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt)
      const key = dayKey(startedAt)
      const byLine = days.get(key) ?? new Map()

      const phases: PhaseRow[] = Array.isArray(run.details?.phases) ? run.details.phases : []
      type Row = { line: string; inserted: number; scanned: number; error?: string; providers: Record<string, number>; searches: string[] }
      const rows: Row[] = phases.length
        ? phases.map((phase) => ({
            line: String(phase.phase ?? 'inconnu'),
            inserted: Number(phase.result?.inserted ?? 0),
            scanned: Number(phase.result?.scanned ?? 0),
            error: phase.error,
            providers: (phase.result?.providerCounts ?? {}) as Record<string, number>,
            searches: searchesOf(phase),
          }))
        : [{
            line: String(run.name ?? 'inconnu').replace(/^cron:daily-auto:?/, '') || 'résumé',
            inserted: Number(run.details?.result?.inserted ?? run.details?.videoInserted ?? 0),
            scanned: Number(run.details?.result?.scanned ?? 0),
            error: run.error,
            providers: (run.details?.result?.providerCounts ?? run.details?.providerCounts ?? {}) as Record<string, number>,
            searches: searchesOf(run.details),
          }]

      for (const row of rows) {
        if (row.line === 'résumé' || row.line === 'summary' || row.line === 'enrich-summary') continue
        const bucket = byLine.get(row.line) ?? { inserted: 0, scanned: 0, runs: 0, errors: 0, providers: {}, searches: new Set<string>() }
        bucket.inserted += row.inserted
        bucket.scanned += row.scanned
        bucket.runs += 1
        if (row.error) bucket.errors += 1
        // Which provider actually supplied the results: "1 648 examinés" says
        // nothing without knowing whether it was YouTube or Dailymotion.
        for (const [provider, n] of Object.entries(row.providers)) {
          bucket.providers[provider] = (bucket.providers[provider] ?? 0) + Number(n || 0)
        }
        // What it searched for, not only how much it brought back: a line can
        // look healthy while asking the same eight questions for a fortnight.
        for (const search of row.searches) {
          if (bucket.searches.size < MAX_SEARCHES_SHOWN) bucket.searches.add(search)
        }
        byLine.set(row.line, bucket)

        const previous = lastSeen.get(row.line)
        if (!previous || startedAt > previous.at) lastSeen.set(row.line, { at: startedAt, inserted: row.inserted })
      }
      days.set(key, byLine)
    }

    const now = Date.now()
    const health = [...lastSeen.entries()]
      .map(([line, seen]) => {
        const hours = (now - seen.at.getTime()) / 3_600_000
        return {
          line,
          lastRunAt: seen.at.toISOString(),
          hoursAgo: Math.round(hours),
          // "Ran but inserted nothing" is the state that hid the dead
          // trending line for eight days; it gets its own name.
          state: hours > STALE_HOURS ? 'arrêtée' : seen.inserted > 0 ? 'active' : 'sans insertion',
        }
      })
      .sort((left, right) => right.hoursAgo - left.hoursAgo)

    return NextResponse.json({
      days: [...days.entries()]
        .sort((left, right) => (left[0] < right[0] ? 1 : -1))
        .map(([day, byLine]) => ({
          day,
          lines: [...byLine.entries()]
            .map(([line, bucket]) => ({ ...bucket, line, searches: [...bucket.searches] }))
            .sort((left, right) => right.inserted - left.inserted),
          total: [...byLine.values()].reduce((sum, bucket) => sum + bucket.inserted, 0),
        })),
      health,
    })
  } catch (error) {
    console.error('[v3/ingest-report] échec', error)
    return NextResponse.json({ error: 'indisponible' }, { status: 500 })
  }
}
