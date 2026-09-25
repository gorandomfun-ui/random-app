/**
 * Reading the journal for the admin page.
 *
 * Pure: the route fetches the runs and the searches, this turns them into
 * days, lines and a verdict per line. A line's health is judged on what it
 * inserted, not on whether it ran: "ran and inserted nothing for a day" is
 * the state that hid the dead trending line, and it gets a name of its own.
 */

import { INTERRUPTED_AFTER_MS, type RunCounters, type RunStatus } from './journal'

export type JournalRun = {
  line: string
  startedAt: Date
  finishedAt?: Date
  status: RunStatus | 'running'
  counters?: Partial<RunCounters>
  errors?: string[]
  note?: string
  dryRun?: boolean
  host?: string
}

export type JournalSearch = { line: string; query: string; at: Date; provider?: string; inserted?: number }

/** What the page shows for a run: the judged status, or what became of a run that never ended. */
export type ShownStatus = RunStatus | 'interrompu' | 'en cours'

export const PARIS = 'Europe/Paris'
/** Past this without an insertion, a line is treated as stopped or silent, not quiet. */
export const STALE_HOURS = 26
/** At most this many searches shown per line per day; the rest is noise. */
const MAX_SEARCHES_SHOWN = 24

export const LINE_LABELS: Record<string, string> = {
  trend: 'Tendances',
  'trend-subjects': 'Tendances-sujets',
  'retro-trend': 'Rétro',
  combo: 'Combinaisons',
  mainstream: 'Mainstream',
  'like-dig': 'Fouille des likes',
  'subject-dig': 'Fouille des sujets',
  web: 'Sites web',
  texts: 'Textes',
  enrich: 'Enrichissement',
  repair: 'Réparations',
  legacy: 'Ancien',
  'like-pool': 'Pool des likes',
  pools: 'Pools par univers',
  feeds: 'Sources humaines',
  authors: 'Auteurs suivis',
}

/** Lines that measure rather than ingest: their "inserted" is a growth, not the day's content. */
const MEASURING_LINES = new Set<string>(['like-pool'])

export function shownStatus(run: Pick<JournalRun, 'status' | 'startedAt'>, now: number): ShownStatus {
  if (run.status !== 'running') return run.status
  return now - run.startedAt.getTime() > INTERRUPTED_AFTER_MS ? 'interrompu' : 'en cours'
}

export function dayKey(date: Date, timeZone = PARIS): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export type LineDay = {
  line: string
  runs: number
  inserted: number
  scanned: number
  duplicates: number
  statuses: Partial<Record<ShownStatus, number>>
  errors: string[]
  searches: string[]
  /** What the line wrote, by provider: from its runs when they count it, else from its searches. */
  providers?: Record<string, number>
  /** Where the provider counts come from: the searches' base can differ from the runs' inserted total, so only their shares are shown. */
  providersFrom?: 'runs' | 'searches'
  /** The latest run's note, when the line leaves one. */
  note?: string
  /** When the latest run seen started: the note and a measuring line's size come from it. */
  noteAt?: Date
}
export type DaySummary = { day: string; total: number; lines: LineDay[] }

const emptyLineDay = (line: string): LineDay => ({ line, runs: 0, inserted: 0, scanned: 0, duplicates: 0, statuses: {}, errors: [], searches: [] })

/** One bucket per day, per line — never a running total across days. Rehearsals are left out. */
export function summariseDays(runs: JournalRun[], searches: JournalSearch[], now: number): DaySummary[] {
  const days = new Map<string, Map<string, LineDay>>()
  const providersFromRuns = new Set<LineDay>()
  const lineDay = (day: string, line: string): LineDay => {
    const byLine = days.get(day) ?? new Map<string, LineDay>()
    days.set(day, byLine)
    const bucket = byLine.get(line) ?? emptyLineDay(line)
    byLine.set(line, bucket)
    return bucket
  }

  for (const run of runs) {
    if (run.dryRun) continue
    const bucket = lineDay(dayKey(run.startedAt), run.line)
    bucket.runs += 1
    bucket.inserted += Number(run.counters?.inserted ?? 0)
    // A measuring line's "scanned" is a size, not work done: the day shows the latest, never the sum of every pass.
    if (MEASURING_LINES.has(run.line)) { if (!bucket.noteAt || run.startedAt > bucket.noteAt) bucket.scanned = Number(run.counters?.scanned ?? 0) }
    else bucket.scanned += Number(run.counters?.scanned ?? 0)
    bucket.duplicates += Number(run.counters?.duplicates ?? 0)
    const status = shownStatus(run, now)
    bucket.statuses[status] = (bucket.statuses[status] ?? 0) + 1
    for (const error of run.errors ?? []) {
      if (bucket.errors.length < 3 && !bucket.errors.includes(error)) bucket.errors.push(error.slice(0, 160))
    }
    if (!bucket.noteAt || run.startedAt > bucket.noteAt) { if (run.note) bucket.note = run.note.slice(0, 200); bucket.noteAt = run.startedAt }
    for (const [provider, n] of Object.entries(run.counters?.byProvider ?? {})) {
      if (!(Number(n) > 0)) continue
      bucket.providers = { ...(bucket.providers ?? {}), [provider]: (bucket.providers?.[provider] ?? 0) + Number(n) }
      bucket.providersFrom = 'runs'
      providersFromRuns.add(bucket)
    }
  }
  // What each line went looking for: a line can look healthy while asking the
  // same eight questions for a fortnight.
  for (const search of searches) {
    const bucket = lineDay(dayKey(search.at), search.line)
    if (bucket.searches.length < MAX_SEARCHES_SHOWN && !bucket.searches.includes(search.query)) bucket.searches.push(search.query)
    // A line whose runs do not count by provider is counted from what each of its searches wrote.
    if (search.provider && Number(search.inserted) > 0 && !providersFromRuns.has(bucket)) {
      bucket.providers = { ...(bucket.providers ?? {}), [search.provider]: (bucket.providers?.[search.provider] ?? 0) + Number(search.inserted) }
      bucket.providersFrom = 'searches'
    }
  }

  return [...days.entries()]
    .sort((left, right) => (left[0] < right[0] ? 1 : -1))
    .map(([day, byLine]) => ({
      day,
      lines: [...byLine.values()].sort((left, right) => right.inserted - left.inserted),
      total: [...byLine.values()].reduce((sum, bucket) => sum + (MEASURING_LINES.has(bucket.line) ? 0 : bucket.inserted), 0),
    }))
}

export type LineHealth = {
  line: string
  lastRunAt: string | null
  lastInsertAt: string | null
  hoursSinceRun: number | null
  hoursSinceInsert: number | null
  /** "muette": it runs, and has inserted nothing for a day. "arrêtée": it has not run for a day. */
  state: 'active' | 'muette' | 'arrêtée' | 'en cours'
}

/** One verdict per line, the worst first. */
export function assessHealth(runs: JournalRun[], now: number, staleHours = STALE_HOURS): LineHealth[] {
  const lastRun = new Map<string, JournalRun>()
  const lastInsert = new Map<string, Date>()
  for (const run of runs) {
    if (run.dryRun) continue
    const previous = lastRun.get(run.line)
    if (!previous || run.startedAt > previous.startedAt) lastRun.set(run.line, run)
    if (Number(run.counters?.inserted ?? 0) > 0) {
      const at = run.finishedAt ?? run.startedAt
      const seen = lastInsert.get(run.line)
      if (!seen || at > seen) lastInsert.set(run.line, at)
    }
  }
  const staleMs = staleHours * 3_600_000
  const rank: Record<LineHealth['state'], number> = { arrêtée: 0, muette: 1, 'en cours': 2, active: 3 }
  return [...lastRun.entries()]
    .map(([line, run]): LineHealth => {
      const insertAt = lastInsert.get(line) ?? null
      const sinceRun = now - run.startedAt.getTime()
      const sinceInsert = insertAt ? now - insertAt.getTime() : null
      const state: LineHealth['state'] =
        sinceRun > staleMs ? 'arrêtée'
          : sinceInsert != null && sinceInsert <= staleMs ? 'active'
            : shownStatus(run, now) === 'en cours' ? 'en cours'
              : 'muette'
      return {
        line,
        lastRunAt: run.startedAt.toISOString(),
        lastInsertAt: insertAt ? insertAt.toISOString() : null,
        hoursSinceRun: Math.round(sinceRun / 3_600_000),
        hoursSinceInsert: sinceInsert != null ? Math.round(sinceInsert / 3_600_000) : null,
        state,
      }
    })
    .sort((left, right) => rank[left.state] - rank[right.state] || (right.hoursSinceRun ?? 0) - (left.hoursSinceRun ?? 0))
}
