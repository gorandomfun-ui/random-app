/**
 * The pools line: one pass a night that adds to every pool but cinema and
 * news, with queries on Dailymotion, which costs nothing. The universe is
 * written at insert from what was asked; the refusals are the usual ones,
 * mini-series included. At the end, the day's recap by universe and the
 * studios the mini-series filter learned.
 *
 * Since 26 September it is also the catch-up: a pool below the floor
 * (`POOL_FLOOR`, drawable videos) gets more queries, the further behind the
 * more, and the pools take turns — one query each, the smallest first — so
 * that a night cut short by its deadline or by the insert cap still served
 * every pool. The cap keeps a night's writes within what the database takes.
 *
 * Each query resumes at the page it had reached, rather than re-reading the
 * first twenty-five results every night — see `pools/depth.ts`. Dailymotion
 * asks nothing for a deep page that it does not ask for a shallow one.
 */

import { isCleanTitle } from '../../cool/clean'
import { loadDepth, nextDepth, saveDepth, depthId, type DepthKey, type DepthState } from '../../pools/depth'
import { POOL_LABELS, POOL_UNIVERSES, queriesForDay, queriesTonight, type PoolUniverse } from '../../pools/facets'
import { computeUniverseRecap, drawableSizes, recapNote, writeUniverseRecap, type UniverseRecap } from '../../pools/recap'
import { learnStudios } from '@/lib/ingest/miniSeriesStore'
import { searchDailymotion } from '../../trend/dig'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'
import type { Universe } from '../../types'

/** Room left at the end for the recap and the studio learning, which read a day of videos. */
const DEADLINE_MARGIN_MS = 3 * 60_000
/** Dailymotion's public API takes a few calls a second; this keeps a night's few hundred well under. */
const SPACING_MS = 300
const SORTS = ['relevance', 'recent'] as const
/** Dailymotion opened in 2005: the window is the whole platform. */
const SINCE = '2005-01-01T00:00:00Z'
/** A night writes at most this many videos: about what the database took from this line on a good night, doubled. */
export const NIGHT_INSERT_CAP = Number(process.env.RANDOM_POOLS_INSERT_CAP ?? 5000)

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type PoolsCursor = {
  queries: Partial<Record<PoolUniverse, string[]>>
  /** What each pool was worth when the night was planned, and what it got. */
  plan?: Array<{ universe: PoolUniverse; drawable: number | null; queries: number; inserted: number }>
  recap?: UniverseRecap
  note?: string
}

/**
 * The night's order: the pools that need it most first, one query each per
 * round. Pure, so the plan can be tested without Dailymotion.
 */
export function nightPlan(sizes: Partial<Record<Universe, number>>, day: Date): Array<{ universe: PoolUniverse; drawable: number | null; queries: string[] }> {
  return POOL_UNIVERSES
    .map((universe) => {
      const size = sizes[universe]
      const drawable = typeof size === 'number' && size >= 0 ? size : null
      return { universe, drawable, queries: queriesForDay(universe, day, queriesTonight(drawable)) }
    })
    .sort((left, right) => (left.drawable ?? Number.MAX_SAFE_INTEGER) - (right.drawable ?? Number.MAX_SAFE_INTEGER))
}

export function rounds<T extends { queries: string[] }>(plan: T[]): Array<{ entry: T; query: string }> {
  const out: Array<{ entry: T; query: string }> = []
  const longest = Math.max(0, ...plan.map((entry) => entry.queries.length))
  for (let round = 0; round < longest; round += 1) {
    for (const entry of plan) if (round < entry.queries.length) out.push({ entry, query: entry.queries[round] })
  }
  return out
}

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const asked: Partial<Record<PoolUniverse, string[]>> = {}
  const now = new Date()
  const before = now.toISOString()
  // A run by hand can ask another night's queries (RANDOM_POOLS_DAY_OFFSET=1: tomorrow's), to bring new content rather than the night's duplicates.
  const offsetDays = Number(process.env.RANDOM_POOLS_DAY_OFFSET ?? 0) || 0
  const queryDay = new Date(now.getTime() + offsetDays * 86_400_000)
  let stopped: 'deadline' | 'cap' | 'rate' | null = null

  // How far behind each pool is decides how many of its queries tonight asks.
  const sizes = await drawableSizes(ctx.db, now).catch((error) => {
    errors.push(`tailles des pools : ${message(error)}`)
    return {} as Partial<Record<Universe, number>>
  })
  const plan = nightPlan(sizes, queryDay)
  for (const entry of plan) asked[entry.universe] = entry.queries
  const insertedBy = new Map<PoolUniverse, number>()

  // Where each query of the night stands, read in one go.
  const keyOf = ({ query, sort }: { query: string; sort: string }): DepthKey => ({ line: 'pools', provider: 'dailymotion', query, sort })
  const depth = await loadDepth(ctx.db, plan.flatMap((entry) => entry.queries.flatMap((query) => SORTS.map((sort) => keyOf({ query, sort })))))
    .catch(() => new Map<string, DepthState>())
  const moved = new Map<string, { key: DepthKey; state: DepthState }>()
  let deepest = 1

  for (const { entry, query } of rounds(plan)) {
    const universe = entry.universe
    for (const sort of SORTS) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { stopped = 'deadline'; break }
      if (counters.inserted >= NIGHT_INSERT_CAP) { stopped = 'cap'; break }
      const key = keyOf({ query, sort })
      const state = depth.get(depthId(key)) ?? { page: 1, dry: 0 }
      if (state.page > deepest) deepest = state.page
      try {
        const videos = await searchDailymotion({ query, sort, after: SINCE, before, page: state.page }, http)
        const kept = videos.filter((video) => isCleanTitle(video.title ?? '')).map((video) => ({ ...video, universeHint: universe }))
        const result = await ctx.admit({ subjectId: `pool:${universe}`, videos: kept })
        addAdmission(counters, { ...result, scanned: videos.length, rejected: { ...result.rejected, ...(videos.length - kept.length ? { unclean: videos.length - kept.length } : {}) } })
        insertedBy.set(universe, (insertedBy.get(universe) ?? 0) + result.inserted)
        moved.set(depthId(key), { key, state: nextDepth(state, videos.length, result.inserted) })
        await ctx.search({ provider: 'dailymotion', query: `${query} [${sort}] p${state.page}`, scanned: videos.length, kept: kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
      } catch (error) {
        errors.push(`dailymotion "${query}" : ${message(error)}`)
        if (/429/.test(message(error))) { ctx.log('dailymotion : limite atteinte, la nuit s_arrête là'); stopped = 'rate'; break }
      }
      await wait(SPACING_MS)
    }
    if (stopped) break
  }

  const summary = plan.map((entry) => ({ universe: entry.universe, drawable: entry.drawable, queries: entry.queries.length, inserted: insertedBy.get(entry.universe) ?? 0 }))
  ctx.log(`rattrapage : ${summary.map((row) => `${POOL_LABELS[row.universe]} ${row.queries} req. +${row.inserted}`).join(' · ')}${stopped ? ` · arrêt : ${stopped === 'cap' ? `plafond de ${NIGHT_INSERT_CAP} insertions` : stopped === 'rate' ? 'limite Dailymotion' : 'heure limite'}` : ''}`)

  // Where every query now stands, so the next night carries on rather than starting over.
  if (!ctx.dryRun) await saveDepth(ctx.db, [...moved.values()])

  // The day's recap: what each pool can serve and what entered it, every line included.
  let recap: UniverseRecap | undefined
  let note: string | undefined
  try {
    recap = await computeUniverseRecap(ctx.db, new Date())
    note = `${recapNote(recap)} · profondeur jusqu_à p${deepest}${stopped === 'cap' ? ` · plafond ${NIGHT_INSERT_CAP} atteint` : ''}`
    if (!ctx.dryRun) await writeUniverseRecap(ctx.db, recap)
    ctx.log(`récap : ${note}`)
  } catch (error) {
    errors.push(`récap par univers : ${message(error)}`)
  }

  // The mini-series studios: the names that kept coming back on the day's refused serials join the filter.
  if (!ctx.dryRun) {
    try {
      const learned = await learnStudios(ctx.db, new Date(now.getTime() - 86_400_000), new Date())
      ctx.log(`mini-séries : ${learned.candidates} noms vus, ${learned.studios} studios reconnus`)
    } catch (error) {
      errors.push(`studios de mini-séries : ${message(error)}`)
    }
  }
  return { counters, errors, cursor: { queries: asked, plan: summary, recap, note } satisfies PoolsCursor }
}
