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

type PhaseRow = { phase?: string; result?: { inserted?: number; scanned?: number }; error?: string }

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
    const days = new Map<string, Map<string, { inserted: number; scanned: number; runs: number; errors: number }>>()
    const lastSeen = new Map<string, { at: Date; inserted: number }>()

    for (const run of runs) {
      const startedAt = run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt)
      const key = dayKey(startedAt)
      const byLine = days.get(key) ?? new Map()

      const phases: PhaseRow[] = Array.isArray(run.details?.phases) ? run.details.phases : []
      const rows: Array<{ line: string; inserted: number; scanned: number; error?: string }> = phases.length
        ? phases.map((phase) => ({
            line: String(phase.phase ?? 'inconnu'),
            inserted: Number(phase.result?.inserted ?? 0),
            scanned: Number(phase.result?.scanned ?? 0),
            error: phase.error,
          }))
        : [{
            line: String(run.name ?? 'inconnu').replace(/^cron:daily-auto:?/, '') || 'résumé',
            inserted: Number(run.details?.result?.inserted ?? run.details?.videoInserted ?? 0),
            scanned: Number(run.details?.result?.scanned ?? 0),
            error: run.error,
          }]

      for (const row of rows) {
        if (row.line === 'résumé' || row.line === 'summary' || row.line === 'enrich-summary') continue
        const bucket = byLine.get(row.line) ?? { inserted: 0, scanned: 0, runs: 0, errors: 0 }
        bucket.inserted += row.inserted
        bucket.scanned += row.scanned
        bucket.runs += 1
        if (row.error) bucket.errors += 1
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
            .map(([line, bucket]) => ({ line, ...bucket }))
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
