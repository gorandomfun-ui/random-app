/**
 * The pools line: one pass a night that only adds to the big universes —
 * music, sport, gaming, humour, parties, food, discovery, craft — with a
 * handful of queries each on Dailymotion, which costs nothing. The universe
 * is written at insert from what was asked; the refusals are the usual
 * ones. It steers nothing: no target share, no budget taken from anyone.
 * At the end, the day's recap by universe.
 */

import { isCleanTitle } from '../../cool/clean'
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

  for (const universe of POOL_UNIVERSES) {
    const queries = queriesForDay(universe, queryDay)
    asked[universe] = queries
    for (const query of queries) {
      for (const sort of SORTS) {
        if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { hitDeadline = true; break }
        try {
          const videos = await searchDailymotion({ query, sort, after: SINCE, before }, http)
          const kept = videos.filter((video) => isCleanTitle(video.title ?? '')).map((video) => ({ ...video, universeHint: universe }))
          const result = await ctx.admit({ subjectId: `pool:${universe}`, videos: kept })
          addAdmission(counters, { ...result, scanned: videos.length, rejected: { ...result.rejected, ...(videos.length - kept.length ? { unclean: videos.length - kept.length } : {}) } })
          await ctx.search({ provider: 'dailymotion', query: `${query} [${sort}]`, scanned: videos.length, kept: kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
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

  // The day's recap: what each pool holds and what entered it, every line included.
  let recap: UniverseRecap | undefined
  let note: string | undefined
  try {
    recap = await computeUniverseRecap(ctx.db, new Date())
    note = recapNote(recap)
    if (!ctx.dryRun) await writeUniverseRecap(ctx.db, recap)
    ctx.log(`récap : ${note}`)
  } catch (error) {
    errors.push(`récap par univers : ${message(error)}`)
  }
  return { counters, errors, cursor: { queries: asked, recap, note } satisfies PoolsCursor }
}
