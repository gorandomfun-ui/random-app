/**
 * The live music line: once a day, concerts from everywhere and recent clips
 * from countries off the charts (see `lib/v3/music/live.ts`). Dailymotion is
 * free and gets most of the queries; YouTube, where most concerts filmed by
 * people are, gets a small daily allowance of searches, paid for by the old
 * daily pass running half as often. Everything found is music; the usual
 * refusals apply, mini-series and ads included.
 */

import { isCleanTitle } from '../../cool/clean'
import { isMusicResult, liveQueriesForDay } from '../../music/live'
import { searchDailymotion, searchYouTube, YOUTUBE_SEARCH_UNITS } from '../../trend/dig'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

const DEADLINE_MARGIN_MS = 30_000
const SPACING_MS = 300
const SORTS = ['relevance', 'recent'] as const
const SINCE = '2005-01-01T00:00:00Z'
/** Clips are the new songs: the last three months. */
const CLIP_WINDOW_MS = 90 * 86_400_000

export const DAILYMOTION_QUERIES = Number(process.env.RANDOM_MUSIC_LIVE_DM_QUERIES ?? 16)

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type MusicLiveCursor = { dailymotion: string[]; youtube: string[]; note?: string }

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const now = new Date()
  const before = now.toISOString()
  const units = Number(process.env.RANDOM_MUSIC_LIVE_UNITS ?? 1000)
  const searches = Math.max(0, Math.floor(units / YOUTUBE_SEARCH_UNITS))
  const clips = Math.floor(searches / 3)
  const plan = liveQueriesForDay(now, { dailymotion: DAILYMOTION_QUERIES, youtubeLive: searches - clips, youtubeClips: clips })
  let live = 0

  const admit = async (videos: Awaited<ReturnType<typeof searchDailymotion>>, query: string) => {
    const clean = videos.filter((video) => isCleanTitle(video.title ?? ''))
    // Only what is music gets in: a place name alone brings the news of that place.
    const kept = clean.filter((video) => isMusicResult(video.title, query)).map((video) => ({ ...video, universeHint: 'music' as const }))
    const result = await ctx.admit({ subjectId: 'pool:music-live', videos: kept })
    addAdmission(counters, { ...result, scanned: videos.length, rejected: {
      ...result.rejected,
      ...(videos.length - clean.length ? { unclean: videos.length - clean.length } : {}),
      ...(clean.length - kept.length ? { 'off-topic': clean.length - kept.length } : {}),
    } })
    live += result.inserted
    return { kept: kept.length, result }
  }

  for (const query of plan.dailymotion) {
    for (const sort of SORTS) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
      try {
        const videos = await searchDailymotion({ query, sort, after: SINCE, before }, http)
        const { kept, result } = await admit(videos, query)
        await ctx.search({ provider: 'dailymotion', query: `${query} [${sort}]`, scanned: videos.length, kept, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
      } catch (error) {
        errors.push(`dailymotion "${query}" : ${message(error)}`)
        if (/429/.test(message(error))) break
      }
      await wait(SPACING_MS)
    }
  }

  const key = process.env.YOUTUBE_API_KEY ?? ''
  if (!key) ctx.log('youtube : pas de clé, musique live YouTube ignorée')
  for (const search of key ? plan.youtube : []) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    if (!(await ctx.quota.reserve(YOUTUBE_SEARCH_UNITS))) { ctx.log('youtube : budget du jour atteint'); break }
    try {
      const after = search.kind === 'clip' ? new Date(now.getTime() - CLIP_WINDOW_MS).toISOString() : SINCE
      const videos = await searchYouTube(key, { query: search.query, order: search.kind === 'clip' ? 'date' : 'relevance', after, before }, http)
      const { kept, result } = await admit(videos, search.query)
      await ctx.search({ provider: 'youtube', query: search.query, scanned: videos.length, kept, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: YOUTUBE_SEARCH_UNITS, insertedIds: result.insertedIds })
    } catch (error) {
      errors.push(`youtube "${search.query}" : ${message(error)}`)
    }
  }

  const note = `musique live : ${plan.dailymotion.length} recherches Dailymotion, ${plan.youtube.length} YouTube, ${live} vidéos entrées`
  ctx.log(note)
  return { counters, errors, cursor: { dailymotion: plan.dailymotion, youtube: plan.youtube.map((search) => search.query), note } satisfies MusicLiveCursor }
}
