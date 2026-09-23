export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import type { Db } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { isAdminRequest, adminUnauthorizedBody } from '@/lib/auth/adminAuth'
import { RUNS, SEARCHES } from '@/lib/v3/ingest/journal'
import { assessHealth, summariseDays, type DaySummary, type JournalRun, type JournalSearch, type LineHealth } from '@/lib/v3/ingest/report'

/**
 * What the ingestion did, by day.
 *
 * The journal (`ingest_runs_v3`) is the truth: every run is written when it
 * starts and judged when it ends, so a run that never returned is on record.
 * `cron_runs`, which said "ok" through eight days of a dead trending line,
 * only fills the days the journal does not cover yet, and goes away after a
 * fortnight of journal.
 */

const PARIS = 'Europe/Paris'
/** Past this, a line is treated as stopped rather than quiet. */
const STALE_HOURS = 26
const WINDOW_DAYS = 14

async function journalReport(db: Db, since: Date, now: number): Promise<{ days: DaySummary[]; health: LineHealth[] }> {
  const runs = (await db
    .collection(RUNS)
    .find({ startedAt: { $gte: since } }, { sort: { startedAt: -1 }, limit: 2000, maxTimeMS: 5000 })
    .toArray()) as unknown as JournalRun[]
  const searches = (await db
    .collection(SEARCHES)
    .find({ at: { $gte: since } }, { projection: { line: 1, query: 1, at: 1, provider: 1, inserted: 1 }, sort: { at: -1 }, limit: 3000, maxTimeMS: 5000 })
    .toArray()) as unknown as JournalSearch[]
  return { days: summariseDays(runs, searches, now), health: assessHealth(runs, now, STALE_HOURS) }
}

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

/** The old report, from `cron_runs`: kept for the days the journal does not cover. */
async function legacyReport(db: Db, since: Date) {
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

    return {
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
    }
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  try {
    const db = await getDatabase()
    const now = Date.now()
    const since = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const journal = await journalReport(db, since, now)
    const legacy = await legacyReport(db, since).catch(() => ({ days: [], health: [] }))
    const covered = new Set(journal.days.map((day) => day.day))
    // The journal's days first; the old report only for the days before it existed.
    const days = [...journal.days, ...legacy.days.filter((day) => !covered.has(day.day))]
      .sort((left, right) => (left.day < right.day ? 1 : -1))
    const health = journal.health.length ? journal.health : legacy.health
    const alerts = journal.health.filter((row) => row.state === 'arrêtée' || row.state === 'muette')
    // The ingestion server's own word on itself, written every ten minutes by scripts/server/status.ts.
    const server = await db.collection('ingest_server_status').findOne({ _id: 'random-ingest' } as never, { maxTimeMS: 2000 }).catch(() => null)

    return NextResponse.json({
      source: journal.health.length ? 'journal' : 'cron_runs',
      days,
      health,
      alerts,
      server,
    })
  } catch (error) {
    console.error('[v3/ingest-report] échec', error)
    return NextResponse.json({ error: 'indisponible' }, { status: 500 })
  }
}
