/**
 * The pools line: one pass a night that only adds to the big universes —
 * music, sport, gaming, humour, parties, food, discovery, craft — with a
 * handful of queries each on Dailymotion, which costs nothing. The universe
 * is written at insert from what was asked; the refusals are the usual
 * ones. It steers nothing: no target share, no budget taken from anyone.
 * At the end, the day's recap by universe.
 *
 * Each query resumes at the page it had reached, rather than re-reading the
 * first twenty-five results every night — see `pools/depth.ts`. Dailymotion
 * asks nothing for a deep page that it does not ask for a shallow one.
 */

import { isCleanTitle } from '../../cool/clean'
import { loadDepth, nextDepth, saveDepth, depthId, type DepthKey, type DepthState } from '../../pools/depth'
import { POOL_UNIVERSES, queriesForDay, type PoolUniverse } from '../../pools/facets'
import { computeUniverseRecap, recapNote, writeUniverseRecap, type UniverseRecap } from '../../pools/recap'
import { searchDailymotion } from '../../trend/dig'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

const DEADLINE_MARGIN_MS = 30_000
/** Dailymotion's public API takes a few calls a second; this keeps a night's hundred well under. */
const SPACING_MS = 300
const SORTS = ['relevance', 'recent'] as const
/** Dailymotion opened in 2005: the window is the whole platform. */
const SINCE = '2005-01-01T00:00:00Z'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type PoolsCursor = { queries: Partial<Record<PoolUniverse, string[]>>; recap?: UniverseRecap; note?: string }

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
  let hitDeadline = false

  // Where each query of the night stands, read in one go.
  const plan: Array<{ universe: PoolUniverse; query: string; sort: (typeof SORTS)[number] }> = []
  for (const universe of POOL_UNIVERSES) {
    const queries = queriesForDay(universe, queryDay)
    asked[universe] = queries
    for (const query of queries) for (const sort of SORTS) plan.push({ universe, query, sort })
  }
  const keyOf = ({ query, sort }: { query: string; sort: string }): DepthKey => ({ line: 'pools', provider: 'dailymotion', query, sort })
  const depth = await loadDepth(ctx.db, plan.map(keyOf)).catch(() => new Map<string, DepthState>())
  const moved = new Map<string, { key: DepthKey; state: DepthState }>()
  let deepest = 1

  for (const universe of POOL_UNIVERSES) {
    const queries = queriesForDay(universe, queryDay)
    for (const query of queries) {
      for (const sort of SORTS) {
        if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { hitDeadline = true; break }
        const key = keyOf({ query, sort })
        const state = depth.get(depthId(key)) ?? { page: 1, dry: 0 }
        if (state.page > deepest) deepest = state.page
        try {
          const videos = await searchDailymotion({ query, sort, after: SINCE, before, page: state.page }, http)
          const kept = videos.filter((video) => isCleanTitle(video.title ?? '')).map((video) => ({ ...video, universeHint: universe }))
          const result = await ctx.admit({ subjectId: `pool:${universe}`, videos: kept })
          addAdmission(counters, { ...result, scanned: videos.length, rejected: { ...result.rejected, ...(videos.length - kept.length ? { unclean: videos.length - kept.length } : {}) } })
          moved.set(depthId(key), { key, state: nextDepth(state, videos.length, result.inserted) })
          await ctx.search({ provider: 'dailymotion', query: `${query} [${sort}] p${state.page}`, scanned: videos.length, kept: kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
        } catch (error) {
          errors.push(`dailymotion "${query}" : ${message(error)}`)
          if (/429/.test(message(error))) { ctx.log('dailymotion : limite atteinte, la nuit s_arrête là'); hitDeadline = true; break }
        }
        await wait(SPACING_MS)
      }
      if (hitDeadline) break
    }
    ctx.log(`${universe} : ${queries.length} requêtes, ${counters.inserted} insérées jusqu_ici`)
    if (hitDeadline) break
  }

  // Where every query now stands, so the next night carries on rather than starting over.
  if (!ctx.dryRun) await saveDepth(ctx.db, [...moved.values()])

  // The day's recap: what each pool holds and what entered it, every line included.
  let recap: UniverseRecap | undefined
  let note: string | undefined
  try {
    recap = await computeUniverseRecap(ctx.db, new Date())
    note = `${recapNote(recap)} · profondeur jusqu_à p${deepest}`
    if (!ctx.dryRun) await writeUniverseRecap(ctx.db, recap)
    ctx.log(`récap : ${note}`)
  } catch (error) {
    errors.push(`récap par univers : ${message(error)}`)
  }
  return { counters, errors, cursor: { queries: asked, recap, note } satisfies PoolsCursor }
}
