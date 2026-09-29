export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import type { Db } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { isAdminRequest, adminUnauthorizedBody } from '@/lib/auth/adminAuth'
import { RUNS, SEARCHES } from '@/lib/v3/ingest/journal'
import { assessHealth, summariseDays, type DaySummary, type JournalRun, type JournalSearch, type LineHealth } from '@/lib/v3/ingest/report'
import { refusalsReport } from '@/lib/ingest/miniSeriesStore'
import { CANDIDATES } from '@/lib/v3/web/candidates'
import { CSE_DAILY_FREE, cseUsed } from '@/lib/v3/web/cseQuota'
import { ObjectId } from 'mongodb'

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

async function freshReport(db: Db): Promise<{ day: string; total: number; counts: Record<string, number>; first: string[] } | null> {
  const doc = (await db.collection('fresh_daily_v1').find({}, { sort: { at: -1 }, limit: 1, maxTimeMS: 2000 }).toArray())[0]
  if (!doc) return null
  const ids = ((doc.ids ?? []) as string[]).slice(0, 15)
  const rows = await db.collection('items').find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { title: 1 }, maxTimeMS: 2000 }).toArray()
  const titles = new Map(rows.map((row) => [String(row._id), String(row.title ?? '')]))
  return { day: String(doc._id), total: Number(doc.total) || 0, counts: (doc.counts ?? {}) as Record<string, number>, first: ids.map((id) => titles.get(id) ?? '').filter(Boolean) }
}
export type DigReport = {
  day: string
  total: number
  levels: Record<string, number>
  bases: Record<string, number>
  queue: Array<{ base: string; state: string; n: number }>
  countries: Array<{ country: string; n: number }>
  subjects: Array<{ id: string; label: string; fr?: string; base: string; fame: string; passes: number; ingested: number; lastRunAt?: string; sample: string[] }>
  runs: Array<{ startedAt: string; status: string; note?: string; errors: number }>
}

/** The dig: what entered today by base and level, the last subjects served with a few titles, the queue by base and the people by country. */
async function digReport(db: Db, now: number): Promise<DigReport> {
  const day = dayKey(new Date(now))
  const start = new Date(`${day}T00:00:00Z`)
  const from = ObjectId.createFromTime(Math.floor(start.getTime() / 1000))
  const entered = await db.collection('items').aggregate<{ _id: { base: string; level: number }; n: number }>([
    { $match: { 'v3.line': 'dig', type: 'video', _id: { $gte: from } } },
    { $group: { _id: { base: '$v3.dig.base', level: '$v3.dig.level' }, n: { $sum: 1 } } },
  ], { hint: 'v3_line_type_rand', maxTimeMS: 8000 }).toArray()
  const levels: Record<string, number> = {}
  const bases: Record<string, number> = {}
  let total = 0
  for (const row of entered) {
    total += row.n
    levels[String(row._id.level)] = (levels[String(row._id.level)] ?? 0) + row.n
    bases[String(row._id.base)] = (bases[String(row._id.base)] ?? 0) + row.n
  }
  const queue = (await db.collection('dig_subjects_v4').aggregate<{ _id: { base: string; state: string }; n: number }>([{ $group: { _id: { base: '$base', state: '$state' }, n: { $sum: 1 } } }], { maxTimeMS: 8000 }).toArray())
    .map((row) => ({ base: String(row._id.base), state: String(row._id.state), n: row.n }))
  const countries = (await db.collection('dig_subjects_v4').aggregate<{ _id: string; n: number }>([{ $match: { base: 'people', state: { $in: ['queued', 'running'] } } }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }], { maxTimeMS: 8000 }).toArray())
    .map((row) => ({ country: String(row._id ?? '?'), n: row.n }))
  const served = await db.collection('dig_subjects_v4').find({ lastRunAt: { $exists: true } }, { sort: { lastRunAt: -1 }, limit: 14, projection: { label: 1, base: 1, fame: 1, passes: 1, ingested: 1, lastRunAt: 1, 'source.fr': 1 }, maxTimeMS: 4000 }).toArray()
  const subjects: DigReport['subjects'] = []
  for (const subject of served) {
    const rows = await db.collection('items').find({ 'v3.subjects.id': String(subject._id), type: 'video', 'v3.line': 'dig' }, { projection: { title: 1 }, sort: { rand: 1 }, limit: 3, hint: 'v3_subject_type_rand', maxTimeMS: 3000 }).toArray().catch(() => [])
    const passes = Object.values((subject.passes ?? {}) as Record<string, unknown[]>).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
    subjects.push({ id: String(subject._id), label: String(subject.label), ...(subject.source?.fr ? { fr: String(subject.source.fr) } : {}), base: String(subject.base), fame: String(subject.fame), passes, ingested: Number(subject.ingested) || 0, ...(subject.lastRunAt ? { lastRunAt: new Date(subject.lastRunAt).toISOString() } : {}), sample: rows.map((row) => String(row.title ?? '')).filter(Boolean) })
  }
  const runs = (await db.collection(RUNS).find({ line: 'dig', startedAt: { $gte: start } }, { sort: { startedAt: -1 }, limit: 6, projection: { startedAt: 1, status: 1, note: 1, errors: 1 }, maxTimeMS: 3000 }).toArray())
    .map((run) => ({ startedAt: new Date(run.startedAt).toISOString(), status: String(run.status), ...(run.note ? { note: String(run.note) } : {}), errors: Array.isArray(run.errors) ? run.errors.length : 0 }))
  return { day, total, levels, bases, queue, countries, subjects, runs }
}

/** The websites waiting for their preview, by source and outcome, and Google's free searches spent today. */
async function webReport(db: Db): Promise<{ bySource: Record<string, Record<string, number>>; googleToday: number; googleCap: number }> {
  const rows = await db.collection(CANDIDATES).aggregate<{ _id: { source: string; status: string }; n: number }>(
    [{ $group: { _id: { source: '$source', status: '$status' }, n: { $sum: 1 } } }], { maxTimeMS: 3000 }).toArray()
  const bySource: Record<string, Record<string, number>> = {}
  for (const row of rows) (bySource[row._id.source] ??= {})[row._id.status] = row.n
  return { bySource, googleToday: await cseUsed(db), googleCap: CSE_DAILY_FREE }
}

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
    // What each pool holds and what entered it, as the nightly pools line closed the day.
    const recap = await db.collection('ingest_universe_recap').find({}, { sort: { at: -1 }, limit: 3, maxTimeMS: 2000 }).toArray().catch(() => [])
    // The mini-series refused at the door over the last three days, with examples, so a wrong refusal shows.
    const miniSeries = await refusalsReport(db, new Date(now - 3 * 24 * 60 * 60 * 1000)).catch(() => null)
    // Fresh of the day: the list the sessions open on, by zone, and the first titles in the order they are served.
    const fresh = await freshReport(db).catch(() => null)
    // Websites: the ones waiting for the server's visit, and what the visits made of the others.
    const web = await webReport(db).catch(() => null)
    // The dig: the four bases, one line — what entered today, the subjects served, the queue.
    const dig = await digReport(db, now).catch(() => null)

    return NextResponse.json({
      miniSeries,
      fresh,
      web,
      dig,
      source: journal.health.length ? 'journal' : 'cron_runs',
      days,
      health,
      alerts,
      server,
      recap,
    })
  } catch (error) {
    console.error('[v3/ingest-report] échec', error)
    return NextResponse.json({ error: 'indisponible' }, { status: 500 })
  }
}
